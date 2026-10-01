import logging
import os
import tempfile

from flask import Blueprint, current_app, jsonify, request
from werkzeug.utils import secure_filename

from configration.database import db
from models.database import Document, OCRResult
from services.rapid_ocr_service import get_rapid_service

logger = logging.getLogger(__name__)

bp = Blueprint("ocr", __name__, url_prefix="/api/ocr")

ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "bmp", "tiff", "tif", "webp"}


def _extension(filename: str) -> str:
    return os.path.splitext(filename)[1].lstrip(".").lower()


def _persist_ocr_result(filename: str, ext: str, file_size: int, tmp_path: str, result: dict) -> dict:
    upload_folder = current_app.config["UPLOAD_FOLDER"]
    os.makedirs(upload_folder, exist_ok=True)

    base_name = os.path.splitext(filename)[0] or "upload"
    stored_name = filename
    stored_path = os.path.join(upload_folder, stored_name)
    counter = 1

    while os.path.exists(stored_path):
        stored_name = f"{base_name}_{counter}.{ext}"
        stored_path = os.path.join(upload_folder, stored_name)
        counter += 1

    with open(tmp_path, "rb") as src, open(stored_path, "wb") as dst:
        dst.write(src.read())

    document = Document(
        filename=stored_name,
        file_path=os.path.abspath(stored_path),
        file_type=ext,
        file_size=file_size,
    )
    db.session.add(document)
    db.session.flush()

    extracted_text = (result.get("extracted_text") or "").strip()
    translated_text = (result.get("translated_text") or extracted_text).strip()

    ocr_result = OCRResult(
        document_id=document.id,
        extracted_text=extracted_text,
        translated_text=translated_text,
        ocr_engine=result.get("ocr_engine", "rapidocr"),
        model_name=result.get("model_name"),
        processing_time=result.get("processing_time"),
    )
    db.session.add(ocr_result)
    db.session.commit()

    response_data = dict(result)
    response_data["document_id"] = document.id
    response_data["ocr_result_id"] = ocr_result.id
    response_data["stored_file_path"] = document.file_path
    return response_data


@bp.route("/image", methods=["POST"])
def ocr_image():
    if "file" not in request.files:
        return jsonify({"success": False, "error": "No file part in request"}), 400

    file = request.files["file"]
    if not file.filename:
        return jsonify({"success": False, "error": "No file selected"}), 400

    filename = secure_filename(file.filename)
    ext = _extension(filename)

    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        return jsonify({
            "success": False,
            "error": f"Unsupported file type '.{ext}'. "
                     f"Allowed: {', '.join(sorted(ALLOWED_IMAGE_EXTENSIONS))}",
        }), 400

    tmp_path: str | None = None
    try:
        file.seek(0, os.SEEK_END)
        file_size = file.tell()
        file.seek(0)

        with tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}") as tmp:
            file.save(tmp.name)
            tmp_path = tmp.name

        result = get_rapid_service().process_image(tmp_path)
        stored_result = _persist_ocr_result(filename, ext, file_size, tmp_path, result)
        return jsonify({"success": True, "data": stored_result}), 200

    except Exception as exc:
        db.session.rollback()
        logger.exception("Image OCR failed for file %s", filename)
        return jsonify({"success": False, "error": str(exc)}), 500

    finally:
        if tmp_path:
            try:
                os.remove(tmp_path)
            except OSError:
                pass   # Already deleted or never created — safe to ignore


@bp.route("/pdf", methods=["POST"])
def ocr_pdf():
    if "file" not in request.files:
        return jsonify({"success": False, "error": "No file part in request"}), 400

    file = request.files["file"]
    if not file.filename:
        return jsonify({"success": False, "error": "No file selected"}), 400

    filename = secure_filename(file.filename)
    if _extension(filename) != "pdf":
        return jsonify({"success": False, "error": "File must be a PDF"}), 400

    tmp_path: str | None = None
    try:
        file.seek(0, os.SEEK_END)
        file_size = file.tell()
        file.seek(0)

        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            file.save(tmp.name)
            tmp_path = tmp.name

        result = get_rapid_service().process_pdf(tmp_path)
        stored_result = _persist_ocr_result(filename, "pdf", file_size, tmp_path, result)
        return jsonify({"success": True, "data": stored_result}), 200

    except Exception as exc:
        db.session.rollback()
        logger.exception("PDF OCR failed for file %s", filename)
        return jsonify({"success": False, "error": str(exc)}), 500

    finally:
        if tmp_path:
            try:
                os.remove(tmp_path)
            except OSError:
                pass
