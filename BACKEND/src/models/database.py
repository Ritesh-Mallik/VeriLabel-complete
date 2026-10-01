from configration.database import db
from datetime import datetime
import json


# ============================================================
# DOCUMENT MODEL
# ============================================================

class Document(db.Model):
    __tablename__ = "documents"

    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(255), nullable=False)
    file_path = db.Column(db.String(500), nullable=False)
    file_type = db.Column(db.String(50), nullable=False)
    file_size = db.Column(db.Integer)
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    ocr_results = db.relationship(
        "OCRResult",
        back_populates="document",
        cascade="all, delete-orphan",
        lazy=True,
    )

    verified_controls = db.relationship(
        "VerifiedControl",
        back_populates="source_document",
        cascade="all, delete-orphan",
        lazy=True,
    )

    def to_dict(self):
        return {
            "id": self.id,
            "filename": self.filename,
            "file_type": self.file_type,
            "file_size": self.file_size,
            "uploaded_at": self.uploaded_at.isoformat(),
        }


# ============================================================
# OCR RESULT MODEL
# ============================================================

class OCRResult(db.Model):
    __tablename__ = "ocr_results"

    id = db.Column(db.Integer, primary_key=True)

    document_id = db.Column(
        db.Integer,
        db.ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    extracted_text = db.Column(db.Text, nullable=False)
    translated_text = db.Column(db.Text, nullable=False)

    ocr_engine = db.Column(db.String(50))
    model_name = db.Column(db.String(100))
    processing_time = db.Column(db.Float)
    processed_at = db.Column(db.DateTime, default=datetime.utcnow)

    document = db.relationship("Document", back_populates="ocr_results")

    validation_results = db.relationship(
        "ValidationResult",
        back_populates="ocr_result",
        cascade="all, delete-orphan",
        lazy=True,
    )

    def to_dict(self):
        return {
            "id": self.id,
            "document_id": self.document_id,
            "extracted_text": self.extracted_text,
            "translated_text": self.translated_text,
            "ocr_engine": self.ocr_engine,
            "model_name": self.model_name,
            "processing_time": self.processing_time,
            "processed_at": self.processed_at.isoformat(),
        }


# ============================================================
# VERIFIED CONTROL (REFERENCE DATA)
# ============================================================

class VerifiedControl(db.Model):
    __tablename__ = "verified_controls"

    id = db.Column(db.Integer, primary_key=True)

    control_name = db.Column(db.String(255), nullable=False)

    source_document_id = db.Column(
        db.Integer,
        db.ForeignKey("documents.id", ondelete="SET NULL"),
        index=True,
    )

    # NEW: link verified control back to the validation result it came from
    source_validation_result_id = db.Column(
        db.Integer,
        db.ForeignKey("validation_results.id", ondelete="SET NULL"),
        unique=True,
        index=True,
    )

    verified_text = db.Column(db.Text, nullable=False)

    status = db.Column(db.String(50), default="verified")  # keep as-is
    approved_at = db.Column(db.DateTime, default=datetime.utcnow)

    source_document = db.relationship(
        "Document",
        back_populates="verified_controls"
    )

    # NEW
    source_validation_result = db.relationship(
        "ValidationResult",
        back_populates="verified_control"
    )

    def to_dict(self):
        return {
            "id": self.id,
            "control_name": self.control_name,
            "verified_text": self.verified_text,
            "status": self.status,
            "approved_at": self.approved_at.isoformat(),
            "source_validation_result_id": self.source_validation_result_id,
        }


# ============================================================
# COMPARISON RESULT
# ============================================================

class ComparisonResult(db.Model):
    __tablename__ = "comparison_results"

    id = db.Column(db.Integer, primary_key=True)

    # ✅ Reference (Verified Data)
    verified_control_id = db.Column(
        db.Integer,
        db.ForeignKey("verified_controls.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ✅ New Input (RAW)
    ocr_result_id = db.Column(
        db.Integer,
        db.ForeignKey("ocr_results.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ✅ 🔥 NEW: Structured Validated Data (CORE FIX)
    validation_result_id = db.Column(
        db.Integer,
        db.ForeignKey("validation_results.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ============================================================
    # COMPARISON METRICS
    # ============================================================

    match_percentage = db.Column(db.Float, default=0.0)

    # Store full deviation report as JSON string
    deviations = db.Column(db.Text, default="[]")

    # PASS / FAIL
    status = db.Column(db.String(50))

    # FINAL CLASSIFICATION (CRITICAL / MODERATE / MINOR)
    final_decision = db.Column(db.String(50))

    # Authenticity score (0–100)
    authenticity_score = db.Column(db.Integer, default=0)

    # ============================================================
    # AUDIT & SECURITY
    # ============================================================

    compared_at = db.Column(db.DateTime, default=datetime.utcnow)

    audit_hash = db.Column(db.String(64))
    content_hash = db.Column(db.String(64))
    submitter_ip = db.Column(db.String(45))

    # ============================================================
    # RELATIONSHIPS (OPTIONAL BUT CLEAN)
    # ============================================================

    verified_control = db.relationship("VerifiedControl")
    ocr_result = db.relationship("OCRResult")
    validation_result = db.relationship("ValidationResult")

    # ============================================================
    # SERIALIZER
    # ============================================================

    def to_dict(self):
        return {
            "id": self.id,
            "verified_control_id": self.verified_control_id,
            "ocr_result_id": self.ocr_result_id,
            "validation_result_id": self.validation_result_id,
            "match_percentage": self.match_percentage,
            "deviations": json.loads(self.deviations) if self.deviations else [],
            "status": self.status,
            "final_decision": self.final_decision,
            "authenticity_score": self.authenticity_score,
            "compared_at": self.compared_at.isoformat(),
            "audit_hash": self.audit_hash,
            "content_hash": self.content_hash,
            "submitter_ip": self.submitter_ip,
        }


# ============================================================
# VALIDATION RESULT (FIXED VERSION 🚀)
# ============================================================

class ValidationResult(db.Model):
    __tablename__ = "validation_results"

    id = db.Column(db.Integer, primary_key=True)

    document_id = db.Column(
        db.Integer,
        db.ForeignKey("documents.id", ondelete="SET NULL"),
        index=True,
    )

    ocr_result_id = db.Column(
        db.Integer,
        db.ForeignKey("ocr_results.id", ondelete="SET NULL"),
        index=True,
    )

    extracted_text = db.Column(db.Text, nullable=False)

    # Extracted Fields
    drug_name = db.Column(db.String(255))
    strength = db.Column(db.String(100))
    dosage_form = db.Column(db.String(120))
    batch_number = db.Column(db.String(120))
    manufacturing_date = db.Column(db.String(120))
    expiry_date = db.Column(db.String(120))
    manufacturer = db.Column(db.String(255))
    marketed_by = db.Column(db.String(255))
    license_number = db.Column(db.String(255))
    storage_conditions = db.Column(db.Text)
    composition_summary = db.Column(db.Text)
    package_type = db.Column(db.String(120))

    prescription_required = db.Column(db.Boolean, default=False)
    serialization_present = db.Column(db.Boolean, default=False)

    missing_fields = db.Column(db.Text, default="[]")
    format_valid = db.Column(db.Boolean, default=True)
    risk_level = db.Column(db.String(20), default="MEDIUM")

    # 🔥 CORE FIXES
    confidence_score = db.Column(db.Integer, default=0)
    status = db.Column(db.String(50), default="needs_review")  # NEW FIELD

    analysis_summary = db.Column(db.Text)
    raw_result = db.Column(db.Text)

    validated_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationship
    ocr_result = db.relationship("OCRResult", back_populates="validation_results")

    # NEW: link to verified_controls
    verified_control = db.relationship(
        "VerifiedControl",
        back_populates="source_validation_result",
        uselist=False,
    )

    # 🔥 AUTO STATUS UPDATE METHOD
    def update_status(self):
        if self.confidence_score >= 70:
            self.status = "verified"
        else:
            self.status = "needs_review"

    def to_dict(self):
        return {
            "id": self.id,
            "document_id": self.document_id,
            "ocr_result_id": self.ocr_result_id,
            "verified_control_id": self.verified_control.id if self.verified_control else None,
            "extracted_text": self.extracted_text,
            "drug_name": self.drug_name,
            "strength": self.strength,
            "dosage_form": self.dosage_form,
            "batch_number": self.batch_number,
            "manufacturing_date": self.manufacturing_date,
            "expiry_date": self.expiry_date,
            "manufacturer": self.manufacturer,
            "marketed_by": self.marketed_by,
            "license_number": self.license_number,
            "storage_conditions": self.storage_conditions,
            "composition_summary": self.composition_summary,
            "package_type": self.package_type,
            "prescription_required": self.prescription_required,
            "serialization_present": self.serialization_present,
            "missing_fields": json.loads(self.missing_fields) if self.missing_fields else [],
            "format_valid": self.format_valid,
            "risk_level": self.risk_level,
            "confidence_score": self.confidence_score,
            "status": self.status,  # 🔥 IMPORTANT
            "analysis_summary": self.analysis_summary,
            "raw_result": json.loads(self.raw_result) if self.raw_result else {},
            "validated_at": self.validated_at.isoformat(),
        }