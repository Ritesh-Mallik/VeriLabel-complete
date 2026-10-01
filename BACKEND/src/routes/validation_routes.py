"""
validation_routes.py - Validation endpoints with persistence.

This module validates OCR text through OpenRouter and now stores the
normalized validation output in the database.
"""

import json
import logging

from flask import Blueprint, jsonify, request

from configration.database import db
from models.database import OCRResult, ValidationResult
from services.openrouter_validation_service import OpenRouterValidationService

logger = logging.getLogger(__name__)

validation_bp = Blueprint("validation", __name__, url_prefix="/api/validation")

_EDITABLE_STRUCTURED_FIELDS = [
    "drug_name",
    "strength",
    "dosage_form",
    "batch_number",
    "manufacturing_date",
    "expiry_date",
    "manufacturer",
    "marketed_by",
    "license_number",
    "storage_conditions",
    "composition_summary",
    "package_type",
]

try:
    _openrouter_service = OpenRouterValidationService()
except EnvironmentError as _env_err:
    _openrouter_service = None
    logger.error("OpenRouterValidationService disabled: %s", _env_err)


def _to_bool(value, default=False):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"true", "1", "yes", "y"}:
            return True
        if lowered in {"false", "0", "no", "n"}:
            return False
    if isinstance(value, (int, float)):
        return bool(value)
    return default


def _to_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _save_validation_result(extracted_text: str, result: dict, ocr_result_id=None, document_id=None):
    linked_ocr_id = _to_int(ocr_result_id, 0) or None
    linked_document_id = _to_int(document_id, 0) or None

    if linked_ocr_id:
        ocr_result = OCRResult.query.get(linked_ocr_id)
        if ocr_result:
            linked_document_id = ocr_result.document_id
        else:
            linked_ocr_id = None

    missing_fields_value = result.get("missing_fields", [])
    if not isinstance(missing_fields_value, list):
        missing_fields_value = []

    validation_row = ValidationResult(
        document_id=linked_document_id,
        ocr_result_id=linked_ocr_id,
        extracted_text=extracted_text,
        drug_name=(result.get("drug_name") or "").strip(),
        strength=(result.get("strength") or "").strip(),
        dosage_form=(result.get("dosage_form") or "").strip(),
        batch_number=(result.get("batch_number") or "").strip(),
        manufacturing_date=(result.get("manufacturing_date") or "").strip(),
        expiry_date=(result.get("expiry_date") or "").strip(),
        manufacturer=(result.get("manufacturer") or "").strip(),
        marketed_by=(result.get("marketed_by") or "").strip(),
        license_number=(result.get("license_number") or "").strip() or None,
        storage_conditions=(result.get("storage_conditions") or "").strip(),
        composition_summary=(result.get("composition_summary") or "").strip(),
        package_type=(result.get("package_type") or "").strip(),
        prescription_required=_to_bool(result.get("prescription_required"), False),
        serialization_present=_to_bool(result.get("serialization_present"), False),
        missing_fields=json.dumps(missing_fields_value),
        format_valid=_to_bool(result.get("format_valid"), True),
        risk_level=(result.get("risk_level") or "MEDIUM").strip().upper(),
        confidence_score=max(0, min(100, _to_int(result.get("confidence_score"), 0))),
        analysis_summary=(result.get("analysis_summary") or "").strip(),
        raw_result=json.dumps(result),
    )
    validation_row.update_status()

    db.session.add(validation_row)
    db.session.commit()
    return validation_row


def _validate_and_save(extracted_text: str, followup_question: str, ocr_result_id=None, document_id=None):
    if followup_question:
        result = _openrouter_service.validate_with_followup(extracted_text, followup_question)
    else:
        result = _openrouter_service.validate_text(extracted_text)

    # Accept both payload shapes:
    # 1) {"drug_name": "...", ...}
    # 2) {"success": true, "data": {"drug_name": "...", ...}}
    normalized_result = result
    if isinstance(result, dict) and isinstance(result.get("data"), dict):
        normalized_result = result["data"]

    saved = _save_validation_result(
        extracted_text=extracted_text,
        result=normalized_result,
        ocr_result_id=ocr_result_id,
        document_id=document_id,
    )
    response_payload = dict(normalized_result)
    response_payload["validation_result_id"] = saved.id
    response_payload["document_id"] = saved.document_id
    response_payload["ocr_result_id"] = saved.ocr_result_id
    return response_payload


def _apply_structured_updates(validation_row: ValidationResult, data: dict):
    for field in _EDITABLE_STRUCTURED_FIELDS:
        if field in data:
            value = (data.get(field) or "")
            if isinstance(value, str):
                value = value.strip()
            setattr(validation_row, field, value)

    normalized_payload = {
        "drug_name": validation_row.drug_name or "",
        "strength": validation_row.strength or "",
        "dosage_form": validation_row.dosage_form or "",
        "batch_number": validation_row.batch_number or "",
        "manufacturing_date": validation_row.manufacturing_date or "",
        "expiry_date": validation_row.expiry_date or "",
        "manufacturer": validation_row.manufacturer or "",
        "marketed_by": validation_row.marketed_by or "",
        "license_number": validation_row.license_number,
        "storage_conditions": validation_row.storage_conditions or "",
        "composition_summary": validation_row.composition_summary or "",
        "package_type": validation_row.package_type or "",
        "format_valid": validation_row.format_valid,
    }

    normalized_payload["missing_fields"] = OpenRouterValidationService._compute_missing_fields(normalized_payload)
    normalized_payload["risk_level"] = OpenRouterValidationService._compute_risk_level(normalized_payload)

    validation_row.missing_fields = json.dumps(normalized_payload["missing_fields"])
    validation_row.risk_level = normalized_payload["risk_level"]

    raw_result = {}
    if validation_row.raw_result:
        try:
            raw_result = json.loads(validation_row.raw_result)
        except (TypeError, ValueError):
            raw_result = {}

    raw_result.update({field: getattr(validation_row, field) for field in _EDITABLE_STRUCTURED_FIELDS})
    raw_result["missing_fields"] = normalized_payload["missing_fields"]
    raw_result["risk_level"] = normalized_payload["risk_level"]
    validation_row.raw_result = json.dumps(raw_result)

    # 🔥 ADD THESE 2 LINES (ONLY CHANGE)
    validation_row.confidence_score = OpenRouterValidationService._calculate_confidence_score(normalized_payload)
    validation_row.update_status()


@validation_bp.route("/validate-text", methods=["POST"])
def validate_text():
    if _openrouter_service is None:
        return jsonify({
            "error": "OpenRouter validation is not configured. "
                     "Set the OPENROUTER_API_KEY environment variable and restart the server."
        }), 503

    data = request.get_json(force=True, silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Request body must be a JSON object"}), 400

    extracted_text = data.get("text", "").strip()
    if not extracted_text:
        return jsonify({"error": "Field 'text' is required and must not be empty"}), 400

    followup_question = data.get("followup_question", "").strip()
    ocr_result_id = data.get("ocr_result_id")
    document_id = data.get("document_id")

    try:
        payload = _validate_and_save(
            extracted_text=extracted_text,
            followup_question=followup_question,
            ocr_result_id=ocr_result_id,
            document_id=document_id,
        )
        return jsonify(payload), 200
    except ValueError as exc:
        db.session.rollback()
        return jsonify({"error": str(exc)}), 400
    except RuntimeError as exc:
        db.session.rollback()
        logger.exception("OpenRouter validation failed")
        return jsonify({"error": str(exc)}), 502
    except Exception:
        db.session.rollback()
        logger.exception("Unexpected error in validate_text")
        return jsonify({"error": "Internal server error"}), 500


@validation_bp.route("/validate-with-reasoning", methods=["POST"])
def validate_with_reasoning():
    if _openrouter_service is None:
        return jsonify({
            "error": "OpenRouter validation is not configured. "
                     "Set the OPENROUTER_API_KEY environment variable and restart the server."
        }), 503

    data = request.get_json(force=True, silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Request body must be a JSON object"}), 400

    extracted_text = data.get("text", "").strip()
    question = data.get("question", "").strip()
    ocr_result_id = data.get("ocr_result_id")
    document_id = data.get("document_id")

    if not extracted_text:
        return jsonify({"error": "Field 'text' is required and must not be empty"}), 400
    if not question:
        return jsonify({"error": "Field 'question' is required for reasoning endpoint"}), 400

    try:
        payload = _validate_and_save(
            extracted_text=extracted_text,
            followup_question=question,
            ocr_result_id=ocr_result_id,
            document_id=document_id,
        )
        return jsonify(payload), 200
    except ValueError as exc:
        db.session.rollback()
        return jsonify({"error": str(exc)}), 400
    except RuntimeError as exc:
        db.session.rollback()
        logger.exception("OpenRouter reasoning validation failed")
        return jsonify({"error": str(exc)}), 502
    except Exception:
        db.session.rollback()
        logger.exception("Unexpected error in validate_with_reasoning")
        return jsonify({"error": "Internal server error"}), 500


@validation_bp.route("/latest", methods=["GET"])
def latest_validation_results():
    """
    Retrieve most recent validation rows.

    Query params:
      - limit: number of rows to return (default 10, max 100)
    """
    try:
        raw_limit = request.args.get("limit", 10, type=int)
        limit = max(1, min(raw_limit or 10, 100))

        rows = (
            ValidationResult.query
            .order_by(ValidationResult.validated_at.desc(), ValidationResult.id.desc())
            .limit(limit)
            .all()
        )

        return jsonify({
            "success": True,
            "count": len(rows),
            "limit": limit,
            "data": [row.to_dict() for row in rows],
        }), 200
    except Exception:
        logger.exception("Unexpected error in latest_validation_results")
        return jsonify({"success": False, "error": "Internal server error"}), 500


@validation_bp.route("/<int:validation_result_id>", methods=["PUT"])
def update_validation_result(validation_result_id):
    if not request.is_json:
        return jsonify({"success": False, "error": "Request must be JSON"}), 400

    try:
        row = ValidationResult.query.get_or_404(validation_result_id)
        data = request.get_json(force=True, silent=True)
        if not data or not isinstance(data, dict):
            return jsonify({"success": False, "error": "Request body must be a JSON object"}), 400

        _apply_structured_updates(row, data)

        db.session.commit()
        return jsonify({"success": True, "data": row.to_dict()}), 200
    except Exception:
        db.session.rollback()
        logger.exception("Unexpected error in update_validation_result")
        return jsonify({"success": False, "error": "Internal server error"}), 500
