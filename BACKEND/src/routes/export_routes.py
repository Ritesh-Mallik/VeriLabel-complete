"""
export_routes.py - JSON export endpoints for database records.
"""

import json
import os
from datetime import datetime

from flask import Blueprint, jsonify

from models.database import (
    ComparisonResult,
    Document,
    OCRResult,
    ValidationResult,
    VerifiedControl,
)

bp = Blueprint("export", __name__, url_prefix="/api/export")

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
EXPORT_DIR = os.path.join(PROJECT_ROOT, "exports", "db_exports")
os.makedirs(EXPORT_DIR, exist_ok=True)


def _timestamp():
    return datetime.utcnow().strftime("%Y%m%d_%H%M%S")


def _write_json_file(prefix: str, payload: dict):
    filename = f"{prefix}_{_timestamp()}.json"
    output_path = os.path.join(EXPORT_DIR, filename)
    with open(output_path, "w", encoding="utf-8") as file_handle:
        json.dump(payload, file_handle, indent=2, ensure_ascii=True)
    return output_path


@bp.route("/ocr-results", methods=["GET"])
def export_ocr_results():
    rows = [row.to_dict() for row in OCRResult.query.order_by(OCRResult.id.desc()).all()]
    payload = {
        "table": "ocr_results",
        "count": len(rows),
        "exported_at": datetime.utcnow().isoformat(),
        "records": rows,
    }
    output_path = _write_json_file("ocr_results", payload)
    return jsonify({
        "success": True,
        "message": "OCR results exported to JSON",
        "output_file": output_path,
        "count": len(rows),
    }), 200


@bp.route("/validation-results", methods=["GET"])
def export_validation_results():
    rows = [row.to_dict() for row in ValidationResult.query.order_by(ValidationResult.id.desc()).all()]
    payload = {
        "table": "validation_results",
        "count": len(rows),
        "exported_at": datetime.utcnow().isoformat(),
        "records": rows,
    }
    output_path = _write_json_file("validation_results", payload)
    return jsonify({
        "success": True,
        "message": "Validation results exported to JSON",
        "output_file": output_path,
        "count": len(rows),
    }), 200


@bp.route("/all", methods=["GET"])
def export_all_records():
    payload = {
        "exported_at": datetime.utcnow().isoformat(),
        "documents": [row.to_dict() for row in Document.query.order_by(Document.id.desc()).all()],
        "ocr_results": [row.to_dict() for row in OCRResult.query.order_by(OCRResult.id.desc()).all()],
        "validation_results": [row.to_dict() for row in ValidationResult.query.order_by(ValidationResult.id.desc()).all()],
        "verified_controls": [row.to_dict() for row in VerifiedControl.query.order_by(VerifiedControl.id.desc()).all()],
        "comparison_results": [row.to_dict() for row in ComparisonResult.query.order_by(ComparisonResult.id.desc()).all()],
    }
    payload["counts"] = {
        "documents": len(payload["documents"]),
        "ocr_results": len(payload["ocr_results"]),
        "validation_results": len(payload["validation_results"]),
        "verified_controls": len(payload["verified_controls"]),
        "comparison_results": len(payload["comparison_results"]),
    }
    output_path = _write_json_file("all_records", payload)
    return jsonify({
        "success": True,
        "message": "All database records exported to JSON",
        "output_file": output_path,
        "counts": payload["counts"],
    }), 200

