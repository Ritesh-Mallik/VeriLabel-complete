"""
openrouter_validation_service.py — OpenRouter API with step-3.5-flash model

This service replaces Groq validation with OpenRouter API using step-3.5-flash:free model
with reasoning capabilities for pharmaceutical label validation.

Features:
  1. Uses OpenRouter API with step-3.5-flash:free model
  2. Reasoning enabled for better analysis
  3. Preserves reasoning_details in conversation context
  4. Same JSON schema as Groq service for compatibility
  5. Robust error handling and timeout management
"""

import json
import logging
import os
import re
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError

import requests

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Prompt template — label text is injected via a USER message, not embedded
# inside triple-quotes in the system prompt, preventing prompt injection.
# ---------------------------------------------------------------------------
_SYSTEM_PROMPT = """You are a pharmaceutical compliance validator with advanced reasoning capabilities.
Analyze the medicine label text the user provides and extract structured fields.
Think step by step about each field and use your reasoning to validate the information.
Return STRICT JSON ONLY — no markdown, no explanation, no code fences.

Required JSON schema:
{
  "drug_name": "string",
  "strength": "string",
  "dosage_form": "string",
  "batch_number": "string",
  "manufacturing_date": "string",
  "expiry_date": "string",
  "manufacturer": "string",
  "marketed_by": "string",
  "license_number": "string or null",
  "storage_conditions": "string",
  "composition_summary": "string",
  "package_type": "string",
  "prescription_required": true or false,
  "serialization_present": true or false,
  "missing_fields": ["list of missing field names"],
  "format_valid": true or false,
  "risk_level": "LOW or MEDIUM or HIGH",
  "confidence_score": 0-100,
  "analysis_summary": "short plain-text explanation"
}"""

_USER_TEMPLATE = """Validate this pharmaceutical label text and extract medicine information:

{label_text}

Use your reasoning to carefully identify each field. Consider:
- Drug name variations and brand names
- Strength formats (mg, ml, %, etc.)
- Dosage form (tablet, capsule, pre-filled syringe, injection, vial, etc.)
- Date formats and validity
- Manufacturer vs marketer identification
- Storage conditions and handling instructions
- Composition or active ingredient summary if present
- Package / container type
- Prescription-only wording
- Missing or unclear information

Important risk guidance:
- Do NOT mark a label HIGH risk only because it is prescription-only.
- Prescription-only wording is normal for many legitimate medicines.
- Risk should primarily reflect missing critical fields, inconsistent dates, absent batch/expiry details, or suspicious/incomplete labeling."""

class OpenRouterValidationService:

    OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
    MODEL = "poolside/laguna-xs-2.1:free"
    TIMEOUT = 45   # seconds — reasoning takes more time

    # requests' own `timeout=` only guards against a connection going silent
    # between chunks — a response trickling in slowly (e.g. streamed
    # reasoning tokens) can run well past TIMEOUT without ever tripping it,
    # leaving gunicorn's worker timeout as the only backstop, which kills
    # the whole process rather than just failing this one request. Running
    # the call in a future gives us a real wall-clock deadline instead.
    _executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="openrouter")

    def __init__(self):
        api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
        if not api_key:
            raise EnvironmentError(
                "OPENROUTER_API_KEY environment variable is not set. "
                "Add it to your .env file before starting the server."
            )
        self._headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        self._conversation_messages = []

    def _post(self, payload: dict, _retry: bool = True) -> requests.Response:
        future = self._executor.submit(
            requests.post,
            self.OPENROUTER_URL,
            headers=self._headers,
            json=payload,
            timeout=self.TIMEOUT,
        )
        try:
            return future.result(timeout=self.TIMEOUT)
        except (FutureTimeoutError, requests.exceptions.Timeout):
            if _retry:
                logger.warning("OpenRouter request timed out after %ss, retrying once", self.TIMEOUT)
                return self._post(payload, _retry=False)
            raise RuntimeError(f"OpenRouter API timed out twice (after {self.TIMEOUT}s each)")
        except requests.exceptions.ConnectionError as exc:
            raise RuntimeError(f"Could not connect to OpenRouter API: {exc}") from exc

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def validate_text(self, extracted_text: str) -> dict:
        """
        Validate pharmaceutical label text via OpenRouter API with reasoning.

        Args:
            extracted_text: Raw OCR-extracted label text.

        Returns:
            Parsed validation result dict matching the schema above.

        Raises:
            ValueError: If extracted_text is empty.
            RuntimeError: If the OpenRouter API call fails or returns unparseable JSON.
        """
        if not extracted_text or not extracted_text.strip():
            raise ValueError("extracted_text must not be empty")

        # Sanitize input — strip triple-quotes to prevent prompt structure corruption
        safe_text = extracted_text.replace('"""', "'''")

        # Build messages for reasoning context
        messages = [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": _USER_TEMPLATE.format(label_text=safe_text)},
        ]

        payload = {
            "model": self.MODEL,
            "temperature": 0.1,  # Slightly higher for reasoning variety
            "messages": messages,
            "reasoning": {"enabled": True}  # Enable reasoning capabilities
        }

        response = self._post(payload)

        if response.status_code != 200:
            raise RuntimeError(
                f"OpenRouter API error {response.status_code}: {response.text[:300]}"
            )

        response_data = response.json()
        assistant_message = response_data["choices"][0]["message"]
        
        # Store reasoning details for potential follow-up questions
        self._conversation_messages = messages + [{
            "role": "assistant",
            "content": assistant_message.get("content"),
            "reasoning_details": assistant_message.get("reasoning_details")
        }]

        raw_content = assistant_message["content"].strip()
        result = self._parse_json(raw_content)
        
        # Add reasoning summary if available
        if assistant_message.get("reasoning_details"):
            reasoning_summary = self._extract_reasoning_summary(assistant_message["reasoning_details"])
            if reasoning_summary and not result.get("analysis_summary"):
                result["analysis_summary"] = reasoning_summary

        return self._normalize_result(result)

    def validate_with_followup(self, extracted_text: str, followup_question: str) -> dict:
        """
        Validate text and ask a follow-up question using preserved reasoning context.
        
        Args:
            extracted_text: Raw OCR-extracted label text.
            followup_question: Additional question to ask about the validation.
            
        Returns:
            Updated validation result with follow-up analysis.
        """
        # First get initial validation
        initial_result = self.validate_text(extracted_text)
        
        # Add follow-up question to conversation
        followup_messages = self._conversation_messages + [
            {"role": "user", "content": followup_question}
        ]
        
        payload = {
            "model": self.MODEL,
            "temperature": 0.1,
            "messages": followup_messages,
            "reasoning": {"enabled": True}
        }
        
        try:
            response = self._post(payload)

            if response.status_code == 200:
                response_data = response.json()
                followup_content = response_data["choices"][0]["message"]["content"]
                
                # Try to parse as JSON, otherwise append to analysis
                try:
                    followup_result = self._parse_json(followup_content)
                    # Merge results, preferring followup for updated fields
                    initial_result.update(followup_result)
                except RuntimeError:
                    # Not JSON, append to analysis summary
                    current_summary = initial_result.get("analysis_summary", "")
                    initial_result["analysis_summary"] = f"{current_summary} Follow-up: {followup_content}"
                    
        except Exception as exc:
            logger.warning(f"Follow-up question failed: {exc}")
            # Return initial result if follow-up fails
            
        return initial_result

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_json(content: str) -> dict:
        """
        Robustly extract the first valid JSON object from the model response.

        Uses json.JSONDecoder.raw_decode() which correctly handles:
          - Leading/trailing whitespace
          - Text after the closing brace
          - Does NOT fall for the greedy-regex trap of grabbing the wrong object
        """
        # Strip markdown code fences if present (```json ... ```)
        content = re.sub(r"^```(?:json)?\s*", "", content, flags=re.MULTILINE)
        content = re.sub(r"\s*```$", "", content, flags=re.MULTILINE)
        content = content.strip()

        decoder = json.JSONDecoder()
        # Walk forward until we find the opening brace
        for idx, char in enumerate(content):
            if char == "{":
                try:
                    obj, _ = decoder.raw_decode(content, idx)
                    if isinstance(obj, dict):
                        return obj
                except json.JSONDecodeError:
                    continue   # try the next '{' if this one fails

        logger.error("Unparseable OpenRouter response: %s", content[:500])
        raise RuntimeError(
            "OpenRouter returned a response that could not be parsed as JSON. "
            "Raw content logged at ERROR level."
        )

    @staticmethod
    def _extract_reasoning_summary(reasoning_details) -> str:
        """
        Extract a concise summary from reasoning details for analysis_summary.
        
        Args:
            reasoning_details: The reasoning_details object from OpenRouter response.
            
        Returns:
            A concise summary string or empty string if extraction fails.
        """
        try:
            if isinstance(reasoning_details, dict):
                # Try to extract key reasoning points
                if "steps" in reasoning_details:
                    steps = reasoning_details["steps"]
                    if isinstance(steps, list) and steps:
                        # Get the last few reasoning steps
                        last_steps = steps[-2:] if len(steps) > 1 else steps
                        summary_parts = []
                        for step in last_steps:
                            if isinstance(step, dict) and "content" in step:
                                content = step["content"][:100]  # Limit length
                                summary_parts.append(content)
                        if summary_parts:
                            return "Reasoning: " + " | ".join(summary_parts)
                            
                # Fallback: try to get any text content
                if "content" in reasoning_details:
                    content = str(reasoning_details["content"])[:150]
                    return f"Analysis: {content}"
                    
        except Exception as exc:
            logger.debug(f"Could not extract reasoning summary: {exc}")
            
        return ""
    @staticmethod
    def _calculate_confidence_score(result: dict) -> int:
        score = 0

        weights = {
            # 🔴 CRITICAL: Patient safety
            "composition_summary": 20,
            "strength": 15,
            "drug_name": 15,

            # 🟠 HIGH: Usage + stability
            "dosage_form": 10,
            "storage_conditions": 10,
            "expiry_date": 10,

            # 🟡 MEDIUM: Trust & origin
            "manufacturer": 8,

            # 🔵 LOWER: Traceability
            "batch_number": 5,
            "manufacturing_date": 4,
            "license_number": 3,
        }

        for field, weight in weights.items():
            value = result.get(field)
            if value and str(value).strip():
                score += weight

        if result.get("format_valid"):
            score += 5

        if result.get("serialization_present"):
            score += 5

        return min(score, 100)

    @staticmethod
    def _normalize_result(result: dict) -> dict:
        """Normalize model output and replace free-form risk with deterministic rules."""
        normalized = dict(result)

        field_defaults = {
            "drug_name": "",
            "strength": "",
            "dosage_form": "",
            "batch_number": "",
            "manufacturing_date": "",
            "expiry_date": "",
            "manufacturer": "",
            "marketed_by": "",
            "license_number": None,
            "storage_conditions": "",
            "composition_summary": "",
            "package_type": "",
            "prescription_required": False,
            "serialization_present": False,
            "missing_fields": [],
            "format_valid": True,
            "risk_level": "MEDIUM",
            "confidence_score": 0,
            "analysis_summary": "",
        }

        for key, default in field_defaults.items():
            normalized.setdefault(key, default)

        for key, value in list(normalized.items()):
            if isinstance(value, str):
                normalized[key] = value.strip()

        if not isinstance(normalized.get("missing_fields"), list):
            normalized["missing_fields"] = []

        normalized["prescription_required"] = bool(normalized.get("prescription_required"))
        normalized["serialization_present"] = bool(normalized.get("serialization_present"))
        normalized["format_valid"] = bool(normalized.get("format_valid"))

        try:
            # 🔥 Override AI score with deterministic scoring
            normalized["confidence_score"] = OpenRouterValidationService._calculate_confidence_score(normalized)
        except (TypeError, ValueError):
            normalized["confidence_score"] = 0

        normalized["missing_fields"] = OpenRouterValidationService._compute_missing_fields(normalized)
        normalized["risk_level"] = OpenRouterValidationService._compute_risk_level(normalized)
        return normalized

    @staticmethod
    def _compute_missing_fields(result: dict) -> list[str]:
        required_fields = [
            "drug_name",
            "strength",
            "batch_number",
            "manufacturing_date",
            "expiry_date",
            "manufacturer",
            "license_number",
        ]

        missing = []
        for field in required_fields:
            value = result.get(field)
            if value is None:
                missing.append(field)
            elif isinstance(value, str) and not value.strip():
                missing.append(field)

        return missing

    @staticmethod
    def _compute_risk_level(result: dict) -> str:
        """
        Deterministic project-relevant risk classification.

        Prescription-only wording is informational and must not raise risk by itself.
        High risk is reserved for missing critical traceability/compliance fields.
        """
        missing = set(result.get("missing_fields", []))

        critical_identity = {"drug_name", "strength", "manufacturer"}
        critical_traceability = {"batch_number", "expiry_date"}
        supporting = {"manufacturing_date", "license_number"}

        if not result.get("format_valid", True):
            return "HIGH"

        if missing & critical_traceability:
            return "HIGH"

        if len(missing & critical_identity) >= 1:
            return "HIGH"

        if len(missing & supporting) == 2:
            return "MEDIUM"

        if len(missing) >= 1:
            return "MEDIUM"

        return "LOW"
