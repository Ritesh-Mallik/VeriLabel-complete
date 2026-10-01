"""
comparison_routes.py

Flow:
  1. User opens comparison page from a verified record
  2. User uploads a new file
  3. Save uploaded file
  4. OCR -> process_image / process_pdf
  5. Save OCR result
  6. Validate OCR text
  7. Compare against selected VerifiedControl
  8. Store ComparisonResult
"""

import os
import json
import logging
from pathlib import Path
from uuid import uuid4

from flask import Blueprint, jsonify, request, current_app
from werkzeug.utils import secure_filename

from configration.database import db
from models.database import (
    Document,
    ComparisonResult,
    VerifiedControl,
    OCRResult,
    ValidationResult,
)
from services.comparison_service import ComparisonService
from services.rapid_ocr_service import get_rapid_service
from services.openrouter_validation_service import OpenRouterValidationService
from services.audit_service import AuditService

logger = logging.getLogger(__name__)

bp = Blueprint("comparison", __name__, url_prefix="/api/comparison")

validation_service = OpenRouterValidationService()

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".pdf", ".webp"}


def _get_upload_root() -> Path:
    """
    Returns a stable upload folder for comparison uploads.
    """
    configured = current_app.config.get("COMPARISON_UPLOAD_FOLDER")
    if configured:
        root = Path(configured)
    else:
        root = Path(current_app.instance_path) / "comparison_uploads"

    root.mkdir(parents=True, exist_ok=True)
    return root


def _save_uploaded_file(file_storage):
    """
    Save uploaded file to disk and return metadata.
    """
    original_name = secure_filename(file_storage.filename or "")
    if not original_name:
        raise ValueError("Empty filename")

    suffix = Path(original_name).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise ValueError("Unsupported file type. Allowed: png, jpg, jpeg, pdf, webp")

    upload_root = _get_upload_root()
    unique_name = f"{uuid4().hex}{suffix}"
    saved_path = upload_root / unique_name

    file_storage.save(saved_path)

    file_size = saved_path.stat().st_size if saved_path.exists() else 0
    mime_type = file_storage.mimetype or ""

    return {
        "original_name": original_name,
        "saved_path": str(saved_path),
        "file_type": mime_type or suffix.replace(".", "").upper(),
        "file_size": file_size,
        "suffix": suffix,
    }


def _run_ocr(saved_path: str, suffix: str):
    """
    OCR wrapper based on file type.
    """
    ocr_service = get_rapid_service()
    if suffix == ".pdf":
        return ocr_service.process_pdf(saved_path)
    return ocr_service.process_image(saved_path)


@bp.route("/run/<int:control_id>", methods=["POST"])
def run_comparison(control_id):
    try:
        # ----------------------------------------------------
        # 1. Get verified reference
        # ----------------------------------------------------
        control = VerifiedControl.query.get_or_404(control_id)

        # ----------------------------------------------------
        # 2. Validate uploaded file
        # ----------------------------------------------------
        if "file" not in request.files:
            return jsonify({"success": False, "error": "No file uploaded"}), 400

        file = request.files["file"]

        if not file or file.filename == "":
            return jsonify({"success": False, "error": "Empty filename"}), 400

        # ----------------------------------------------------
        # 3. Save uploaded file permanently/stably
        # ----------------------------------------------------
        try:
            upload_meta = _save_uploaded_file(file)
        except ValueError as e:
            return jsonify({"success": False, "error": str(e)}), 400

        saved_path = upload_meta["saved_path"]
        suffix = upload_meta["suffix"]

        # ----------------------------------------------------
        # 4. Create Document row for uploaded label B
        # ----------------------------------------------------
        document = Document(
            filename=upload_meta["original_name"],
            file_path=saved_path,
            file_type=upload_meta["file_type"],
            file_size=upload_meta["file_size"],
        )
        db.session.add(document)
        db.session.flush()

        # ----------------------------------------------------
        # 5. OCR processing
        # ----------------------------------------------------
        ocr_output = _run_ocr(saved_path, suffix)
        extracted_text = (ocr_output or {}).get("extracted_text", "") or ""

        if not extracted_text.strip():
            db.session.rollback()
            return jsonify({
                "success": False,
                "error": "OCR completed but no text was extracted from the uploaded file."
            }), 400

        # ----------------------------------------------------
        # 6. Save OCR result
        # ----------------------------------------------------
        ocr_result = OCRResult(
            document_id=document.id,
            extracted_text=extracted_text,
            translated_text=(ocr_output or {}).get("translated_text", "") or "",
            ocr_engine=(ocr_output or {}).get("ocr_engine"),
            model_name=(ocr_output or {}).get("model_name"),
            processing_time=(ocr_output or {}).get("processing_time"),
        )
        db.session.add(ocr_result)
        db.session.flush()

        # ----------------------------------------------------
        # 7. Validation of uploaded label B
        # ----------------------------------------------------
        validation_output = validation_service.validate_text(extracted_text) or {}

        validation_result = ValidationResult(
            document_id=document.id,
            ocr_result_id=ocr_result.id,
            extracted_text=extracted_text,
            drug_name=validation_output.get("drug_name"),
            strength=validation_output.get("strength"),
            dosage_form=validation_output.get("dosage_form"),
            batch_number=validation_output.get("batch_number"),
            manufacturing_date=validation_output.get("manufacturing_date"),
            expiry_date=validation_output.get("expiry_date"),
            manufacturer=validation_output.get("manufacturer"),
            marketed_by=validation_output.get("marketed_by"),
            license_number=validation_output.get("license_number"),
            storage_conditions=validation_output.get("storage_conditions"),
            composition_summary=validation_output.get("composition_summary"),
            package_type=validation_output.get("package_type"),
            prescription_required=validation_output.get("prescription_required", False),
            serialization_present=validation_output.get("serialization_present", False),
            missing_fields=json.dumps(validation_output.get("missing_fields", [])),
            format_valid=validation_output.get("format_valid", True),
            risk_level=validation_output.get("risk_level"),
            confidence_score=validation_output.get("confidence_score", 0),
            analysis_summary=validation_output.get("analysis_summary"),
            raw_result=json.dumps(validation_output),
        )

        validation_result.update_status()
        db.session.add(validation_result)
        db.session.flush()

        # ----------------------------------------------------
        # 8. Comparison
        # Reference = selected verified control
        # Incoming = newly uploaded + OCR'd + validated file
        # ----------------------------------------------------
        comparison_output = ComparisonService.run_comparison(
            verified_text=control.verified_text,
            validation_data=validation_result.to_dict(),
        )

        # ----------------------------------------------------
        # 9. Final decision for stored comparison record
        # ----------------------------------------------------
        final_decision = (
            "VALID"
            if comparison_output.get("status") == "PASS"
            else "SUSPICIOUS"
        )

        submitter_ip = request.remote_addr or "unknown"

        comparison = ComparisonResult(
            verified_control_id=control.id,
            ocr_result_id=ocr_result.id,
            validation_result_id=validation_result.id,
            match_percentage=comparison_output.get("match_percentage", 0.0),
            deviations=json.dumps(comparison_output.get("deviations", [])),
            status=comparison_output.get("status"),
            final_decision=final_decision,
            authenticity_score=comparison_output.get("authenticity_score", 0),
            submitter_ip=submitter_ip,
        )

        db.session.add(comparison)
        db.session.flush()

        # ----------------------------------------------------
        # 10. Audit hashes
        # ----------------------------------------------------
        comparison.audit_hash = AuditService.generate_audit_hash(
            extracted_text=extracted_text,
            match_percentage=comparison.match_percentage,
            status=comparison.status,
            final_decision=comparison.final_decision,
            authenticity_score=comparison.authenticity_score,
            compared_at=comparison.compared_at.isoformat(),
            submitter_ip=submitter_ip,
        )

        comparison.content_hash = AuditService.generate_content_hash(
            extracted_text=extracted_text,
            match_percentage=comparison.match_percentage,
            status=comparison.status,
        )

        db.session.commit()

        return jsonify({
            "success": True,
            "data": comparison.to_dict(),
            "validation": validation_result.to_dict(),
            "reference": control.to_dict(),
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.exception("Comparison failed")
        return jsonify({"success": False, "error": str(e)}), 500


@bp.route("/result/<int:id>", methods=["GET"])
def get_result(id):
    comparison = ComparisonResult.query.get_or_404(id)
    return jsonify({"success": True, "data": comparison.to_dict()}), 200


@bp.route("/verify/<int:id>", methods=["GET"])
def verify(id):
    comparison = ComparisonResult.query.get_or_404(id)

    verification = AuditService.verify_record(
        {
            "extracted_text": comparison.ocr_result.extracted_text,
            "match_percentage": comparison.match_percentage,
            "status": comparison.status,
            "final_decision": comparison.final_decision,
            "authenticity_score": comparison.authenticity_score,
            "compared_at": comparison.compared_at.isoformat(),
            "submitter_ip": comparison.submitter_ip,
        },
        comparison.audit_hash,
    )

    return jsonify({"success": True, "verification": verification}), 200