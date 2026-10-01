"""
comparison_service.py

Advanced Pharmaceutical Label Comparison Engine

Purpose:
- Compare a stored verified reference label against a newly uploaded label
  that has gone through OCR and validation.
- Produce exact-match, structured mismatch, semantic mismatch,
  and final scoring output.

Design:
- exact_match(): compares verified_text vs extracted_text
- numeric_validation(): compares critical structured fields
- fuzzy_match(): compares drug names
- semantic_match(): compares composition/instruction-like fields
- classify(): derives PASS/FAIL and severity
- run_comparison(): master pipeline

Important:
- verified_data is optional for backward compatibility.
- If verified_data is not provided, structured checks are skipped
  instead of incorrectly comparing validation_data against itself.
"""

import difflib
import logging
import re
from typing import Dict, Any, List, Tuple, Optional

logger = logging.getLogger(__name__)


class ComparisonService:
    PASS_THRESHOLD = 95.0

    # ============================================================
    # NORMALIZATION HELPERS
    # ============================================================

    @staticmethod
    def normalize_text(text: Optional[str]) -> str:
        if not text:
            return ""
        return " ".join(str(text).lower().strip().split())

    @staticmethod
    def normalize_token(value: Any) -> str:
        if value is None:
            return ""
        return ComparisonService.normalize_text(str(value))

    @staticmethod
    def normalize_numeric_like(value: Any) -> str:
        """
        Normalize values like:
        - '500 mg' -> '500mg'
        - ' 01 / 12 / 2025 ' -> '01/12/2025'
        """
        if value is None:
            return ""

        text = str(value).strip().lower()
        text = re.sub(r"\s+", "", text)
        return text

    @staticmethod
    def safe_dict(value: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        return value if isinstance(value, dict) else {}

    # ============================================================
    # EXACT MATCH (WORD LEVEL)
    # ============================================================

    @staticmethod
    def exact_match(verified_text: str, production_text: str) -> Tuple[float, List[Dict[str, Any]]]:
        verified = ComparisonService.normalize_text(verified_text)
        production = ComparisonService.normalize_text(production_text)

        v_words = verified.split()
        p_words = production.split()

        similarity = difflib.SequenceMatcher(None, v_words, p_words).ratio()

        diff = difflib.ndiff(v_words, p_words)
        deviations: List[Dict[str, Any]] = []

        for token in diff:
            if token.startswith("- "):
                deviations.append({
                    "type": "removed",
                    "word": token[2:],
                    "severity": "MINOR",
                })
            elif token.startswith("+ "):
                deviations.append({
                    "type": "added",
                    "word": token[2:],
                    "severity": "MINOR",
                })

        return similarity, deviations

    # ============================================================
    # NUMERIC VALIDATION (CRITICAL)
    # ============================================================

    @staticmethod
    def numeric_validation(ref: Dict[str, Any], new: Dict[str, Any]) -> List[Dict[str, Any]]:
        deviations: List[Dict[str, Any]] = []

        numeric_fields = [
            "strength",
            "expiry_date",
            "manufacturing_date",
        ]

        for field in numeric_fields:
            ref_val = ComparisonService.normalize_numeric_like(ref.get(field))
            new_val = ComparisonService.normalize_numeric_like(new.get(field))

            # Only compare when both sides actually exist
            if ref_val and new_val and ref_val != new_val:
                deviations.append({
                    "field": field,
                    "expected": ref.get(field),
                    "found": new.get(field),
                    "type": "NUMERIC_MISMATCH",
                    "severity": "CRITICAL",
                })

        return deviations

    # ============================================================
    # FUZZY MATCH (DRUG NAME)
    # ============================================================

    @staticmethod
    def fuzzy_match(ref: Dict[str, Any], new: Dict[str, Any]) -> List[Dict[str, Any]]:
        deviations: List[Dict[str, Any]] = []

        ref_name = ComparisonService.normalize_text(ref.get("drug_name", ""))
        new_name = ComparisonService.normalize_text(new.get("drug_name", ""))

        if ref_name and new_name:
            similarity = difflib.SequenceMatcher(None, ref_name, new_name).ratio()

            if similarity < 0.90:
                deviations.append({
                    "field": "drug_name",
                    "expected": ref.get("drug_name"),
                    "found": new.get("drug_name"),
                    "type": "FUZZY_MISMATCH",
                    "severity": "CRITICAL",
                })

        return deviations

    # ============================================================
    # SEMANTIC / TEXTUAL MATCH
    # ============================================================

    @staticmethod
    def semantic_match(ref: Dict[str, Any], new: Dict[str, Any]) -> List[Dict[str, Any]]:
        deviations: List[Dict[str, Any]] = []

        text_fields = [
            ("composition_summary", "composition"),
            ("storage_conditions", "storage"),
            ("manufacturer", "manufacturer"),
            ("marketed_by", "marketed_by"),
            ("license_number", "license_number"),
            ("dosage_form", "dosage_form"),
            ("batch_number", "batch_number"),
            ("package_type", "package_type"),
        ]

        for source_field, output_field in text_fields:
            ref_val = ComparisonService.normalize_text(ref.get(source_field, ""))
            new_val = ComparisonService.normalize_text(new.get(source_field, ""))

            if ref_val and new_val:
                similarity = difflib.SequenceMatcher(None, ref_val, new_val).ratio()

                threshold = 0.85 if source_field == "composition_summary" else 0.90

                if similarity < threshold:
                    deviations.append({
                        "field": output_field,
                        "expected": ref.get(source_field),
                        "found": new.get(source_field),
                        "type": "SEMANTIC_MISMATCH",
                        "severity": "MODERATE" if source_field == "composition_summary" else "MINOR",
                    })

        return deviations

    # ============================================================
    # DEDUPLICATION
    # ============================================================

    @staticmethod
    def deduplicate_deviations(deviations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        seen = set()
        unique: List[Dict[str, Any]] = []

        for deviation in deviations:
            key = (
                deviation.get("field"),
                deviation.get("type"),
                str(deviation.get("expected")),
                str(deviation.get("found")),
                str(deviation.get("word")),
            )
            if key not in seen:
                seen.add(key)
                unique.append(deviation)

        return unique

    # ============================================================
    # CLASSIFICATION
    # ============================================================

    @staticmethod
    def classify(deviations: List[Dict[str, Any]]) -> Tuple[str, str]:
        if any(d.get("severity") == "CRITICAL" for d in deviations):
            return "FAIL", "CRITICAL"

        if any(d.get("severity") == "MODERATE" for d in deviations):
            return "FAIL", "MODERATE"

        return "PASS", "MINOR"

    # ============================================================
    # SCORE CALCULATION
    # ============================================================

    @staticmethod
    def compute_authenticity_score(match_percentage: float, deviations: List[Dict[str, Any]]) -> int:
        penalty = 0

        for deviation in deviations:
            severity = deviation.get("severity")
            if severity == "CRITICAL":
                penalty += 12
            elif severity == "MODERATE":
                penalty += 6
            else:
                penalty += 2

        score = int(round(match_percentage - penalty))
        return max(0, min(100, score))

    # ============================================================
    # MAIN PIPELINE
    # ============================================================

    @staticmethod
    def run_comparison(
        verified_text: str,
        validation_data: Dict[str, Any],
        verified_data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        verified_text:
            trusted text from VerifiedControl

        validation_data:
            structured validated output from uploaded label B

        verified_data:
            optional structured validated output for the verified reference.
            If not supplied, structured comparisons are skipped safely.
        """
        validation_data = ComparisonService.safe_dict(validation_data)
        verified_data = ComparisonService.safe_dict(verified_data)

        extracted_text = validation_data.get("extracted_text", "") or ""

        # 1. Exact text match: verified reference text vs uploaded extracted text
        similarity, exact_deviations = ComparisonService.exact_match(
            verified_text,
            extracted_text,
        )

        numeric_deviations: List[Dict[str, Any]] = []
        fuzzy_deviations: List[Dict[str, Any]] = []
        semantic_deviations: List[Dict[str, Any]] = []

        # 2. Structured comparisons only when verified structured data exists
        if verified_data:
            numeric_deviations = ComparisonService.numeric_validation(
                verified_data,
                validation_data,
            )

            fuzzy_deviations = ComparisonService.fuzzy_match(
                verified_data,
                validation_data,
            )

            semantic_deviations = ComparisonService.semantic_match(
                verified_data,
                validation_data,
            )
        else:
            logger.warning(
                "ComparisonService.run_comparison called without verified_data; "
                "structured field checks were skipped."
            )

        # 3. Combine and deduplicate
        all_deviations = (
            exact_deviations +
            numeric_deviations +
            fuzzy_deviations +
            semantic_deviations
        )
        all_deviations = ComparisonService.deduplicate_deviations(all_deviations)

        # 4. Final classification
        status, severity = ComparisonService.classify(all_deviations)

        # 5. Score calculation
        match_percentage = round(similarity * 100, 2)
        authenticity_score = ComparisonService.compute_authenticity_score(
            match_percentage,
            all_deviations,
        )

        return {
            "match_percentage": match_percentage,
            "deviations": all_deviations,
            "status": status,
            "final_decision": severity,
            "authenticity_score": authenticity_score,
        }