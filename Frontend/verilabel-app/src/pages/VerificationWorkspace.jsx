import { useMemo, useRef, useState } from "react";
import Navbar from "../components/Navbar";
import {
  createVerifiedControl,
  updateValidationResult,
  uploadForOCR,
  validateExtractedText,
} from "../api/verilabelApi";

const MAX_FILE_SIZE_BYTES = 16 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".tif", ".webp"];

const fieldConfig = [
  { label: "Medicine Name", key: "drug_name", col: 1 },
  { label: "Strength", key: "strength", col: 1 },
  { label: "Dosage Form", key: "dosage_form", col: 1 },
  { label: "Batch No", key: "batch_number", col: 1 },
  { label: "MFG Date", key: "manufacturing_date", col: 1 },
  { label: "EXP Date", key: "expiry_date", col: 1 },
  { label: "Manufacturer", key: "manufacturer", col: 2 },
  { label: "Marketed By", key: "marketed_by", col: 2 },
  { label: "License No", key: "license_number", col: 1 },
  { label: "Package Type", key: "package_type", col: 1 },
];

const emptyFormValues = {
  drug_name: "",
  strength: "",
  dosage_form: "",
  batch_number: "",
  manufacturing_date: "",
  expiry_date: "",
  manufacturer: "",
  marketed_by: "",
  license_number: "",
  package_type: "",
  composition_summary: "",
  storage_conditions: "",
};

function getRiskTone(riskLevel) {
  const normalized = (riskLevel || "").toUpperCase();
  if (normalized === "HIGH") {
    return { text: "text-[#ba1a1a]", label: "High", border: "border-[#ba1a1a]" };
  }
  if (normalized === "LOW") {
    return { text: "text-[#006970]", label: "Low", border: "border-[#006970]" };
  }
  return { text: "text-[#6a3100]", label: "Medium", border: "border-[#6a3100]" };
}

function extractControlName(fileName, drugName) {
  const fromDrug = (drugName || "").trim();
  if (fromDrug) {
    return fromDrug;
  }

  const fromFile = (fileName || "").trim();
  if (!fromFile) {
    return "OCR Verification";
  }
  return fromFile.replace(/\.[^/.]+$/, "");
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) {
    return "";
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function VerificationWorkspace() {
  const inputRef = useRef(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [ocrResult, setOcrResult] = useState(null);
  const [validation, setValidation] = useState(null);
  const [formValues, setFormValues] = useState(emptyFormValues);

  const riskTone = getRiskTone(validation?.risk_level);
  const confidenceScore =
    typeof validation?.confidence_score === "number" ? validation.confidence_score : 0;
  const complianceLabel =
    validation?.status === "verified"
      ? "VERIFIED"
      : validation?.status === "needs_review"
        ? "NEEDS REVIEW"
        : "PENDING";

  const complianceItems = useMemo(() => {
    if (!validation) {
      return [
        {
          icon: "info",
          color: "text-[#6a3100]",
          text: "Upload a label to generate compliance checks.",
        },
      ];
    }

    const items = [];
    if (validation.format_valid) {
      items.push({
        icon: "check_circle",
        color: "text-[#006970]",
        text: "Label format checks passed.",
      });
    } else {
      items.push({
        icon: "warning",
        color: "text-[#ba1a1a]",
        text: "Label format checks failed and requires manual review.",
      });
    }

    if (Array.isArray(validation.missing_fields) && validation.missing_fields.length > 0) {
      items.push({
        icon: "info",
        color: "text-[#6a3100]",
        text: `Missing fields: ${validation.missing_fields.join(", ")}.`,
      });
    } else {
      items.push({
        icon: "check_circle",
        color: "text-[#006970]",
        text: "All mandatory extracted fields are present.",
      });
    }

    if (validation.analysis_summary) {
      items.push({
        icon: "description",
        color: "text-[#004275]",
        text: validation.analysis_summary,
      });
    }

    return items;
  }, [validation]);

  const rawText = (ocrResult?.extracted_text || "").trim();
  const fileSizeLabel = formatBytes(ocrResult?.file_size) || "-";
  const rawTextLines = rawText
    ? rawText.split(/\r?\n/).filter((line) => line.trim())
    : [
        "[SYSTEM_LOG]: WAITING FOR INPUT...",
        "Upload a pharmaceutical label to start OCR extraction and validation.",
      ];

  function applyValidationToForm(validationPayload) {
    setFormValues({
      drug_name: validationPayload.drug_name || "",
      strength: validationPayload.strength || "",
      dosage_form: validationPayload.dosage_form || "",
      batch_number: validationPayload.batch_number || "",
      manufacturing_date: validationPayload.manufacturing_date || "",
      expiry_date: validationPayload.expiry_date || "",
      manufacturer: validationPayload.manufacturer || "",
      marketed_by: validationPayload.marketed_by || "",
      license_number: validationPayload.license_number || "",
      package_type: validationPayload.package_type || "",
      composition_summary: validationPayload.composition_summary || "",
      storage_conditions: validationPayload.storage_conditions || "",
    });
  }

  function resetWorkspace() {
    setErrorMessage("");
    setStatusMessage("");
    setSelectedFileName("");
    setOcrResult(null);
    setValidation(null);
    setFormValues(emptyFormValues);
  }

  function validateFile(file) {
    const lowerName = file.name.toLowerCase();
    const extension = lowerName.includes(".") ? lowerName.slice(lowerName.lastIndexOf(".")) : "";

    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      throw new Error("Unsupported file type. Upload PDF, PNG, JPG, JPEG, BMP, TIFF, TIF, or WEBP.");
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new Error("File is too large. Maximum allowed size is 16 MB.");
    }
  }

  async function processFile(file) {
    try {
      validateFile(file);
      setIsProcessing(true);
      setErrorMessage("");
      setStatusMessage("Running OCR extraction...");
      setSelectedFileName(file.name);

      const ocrPayload = await uploadForOCR(file);
      setOcrResult(ocrPayload);

      setStatusMessage("Validating extracted text...");
      const validationPayload = await validateExtractedText({
        text: ocrPayload.extracted_text || "",
        ocrResultId: ocrPayload.ocr_result_id,
        documentId: ocrPayload.document_id,
      });

      setValidation(validationPayload);
      applyValidationToForm(validationPayload);
      setStatusMessage("OCR and validation completed successfully.");
    } catch (error) {
      setErrorMessage(error.message || "Failed to process selected file.");
      setStatusMessage("");
    } finally {
      setIsProcessing(false);
    }
  }

  async function onFinalize() {
    if (!ocrResult?.ocr_result_id || !validation?.validation_result_id) {
      setErrorMessage("No OCR result found. Please upload a file first.");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage("");

      const controlName = extractControlName(selectedFileName, formValues.drug_name);
      const updatedValidation = await updateValidationResult(
        validation.validation_result_id,
        formValues,
      );
      setValidation(updatedValidation);
      const status = updatedValidation?.status === "verified" ? "verified" : "rejected";

      const savedControl = await createVerifiedControl(
        ocrResult.ocr_result_id,
        controlName,
        status,
        formValues,
      );

      setStatusMessage(`Verification saved. Control ID: ${savedControl.id}`);
    } catch (error) {
      setErrorMessage(error.message || "Failed to submit verification.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function onPickFile() {
    if (inputRef.current) {
      inputRef.current.click();
    }
  }

  function onInputFileChange(event) {
    const file = event.target.files?.[0];
    if (file) {
      processFile(file);
    }
    event.target.value = "";
  }

  function onDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  }

  function onFieldUpdate(key, value) {
    setFormValues((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  return (
    <div className="bg-[#f8f9ff] text-[#171c22] font-['Inter']">
      <Navbar />
      <div className="flex overflow-visible md:h-[calc(100vh-72px)] md:overflow-hidden">

        <main className="flex-1 flex flex-col md:flex-row overflow-visible md:overflow-hidden">
          <section className="w-full md:w-1/2 bg-[#f8f9ff] flex flex-col p-4 sm:p-8 space-y-6 overflow-y-auto">
            <header>
              <h1 className="font-['Public_Sans'] font-extrabold text-3xl tracking-tight text-[#004275]">
                Verification Workspace
              </h1>
              <p className="text-[#414750] text-sm mt-1">
                Upload pharmaceutical labeling for automated compliance extraction.
              </p>
            </header>

            {errorMessage && (
              <div className="rounded-lg border border-[#ba1a1a]/20 bg-[#ffdad6]/40 px-4 py-3 text-sm text-[#ba1a1a]">
                {errorMessage}
              </div>
            )}

            {statusMessage && (
              <div className="rounded-lg border border-[#004275]/20 bg-[#d2e4ff]/30 px-4 py-3 text-sm text-[#004275]">
                {statusMessage}
              </div>
            )}

            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept={ACCEPTED_EXTENSIONS.join(",")}
              onChange={onInputFileChange}
            />

            <div
              onClick={onPickFile}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setIsDragging(false);
              }}
              onDrop={onDrop}
              className={`relative group border-2 border-dashed rounded-xl p-6 sm:p-12 flex flex-col items-center justify-center transition-all cursor-pointer ${
                isDragging
                  ? "border-[#004275] bg-[#d2e4ff]/50"
                  : "border-[#c1c7d2]/40 hover:border-[#004275]/50 bg-[#f0f4fd]"
              }`}
            >
              <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-sm mb-4">
                <span className="material-symbols-outlined text-[#004275] text-3xl">
                  upload_file
                </span>
              </div>
              <div className="text-center">
                <p className="font-semibold text-[#171c22]">Drag and drop labeling file</p>
                <p className="text-xs text-[#414750] mt-1">
                  Supports PDF, JPG, PNG, TIFF, BMP, WEBP (Max 16MB)
                </p>
                {selectedFileName && (
                  <p className="text-xs text-[#004275] mt-2 font-semibold">{selectedFileName}</p>
                )}
              </div>
              <button
                type="button"
                className="mt-6 px-6 py-2 bg-white border border-[#c1c7d2]/30 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-slate-50 transition-colors"
              >
                Select File
              </button>
            </div>

            <div className="flex-1 flex flex-col min-h-[400px]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-['Public_Sans'] font-bold text-sm uppercase tracking-wider text-[#414750] flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">segment</span>
                  Raw OCR Stream
                </h3>
                <div className="flex items-center gap-2 px-3 py-1 bg-[#7af1fc]/30 text-[#006970] rounded-full">
                  {isProcessing ? (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#006970] opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-[#006970]" />
                    </span>
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-[#004275]" />
                  )}
                  <span className="text-[10px] font-bold uppercase">
                    {isProcessing ? "Analyzing..." : ocrResult ? "Completed" : "Idle"}
                  </span>
                </div>
              </div>

              <div className="flex-1 bg-[#d6dae3]/30 rounded-xl p-6 font-mono text-xs leading-relaxed text-[#414750] border-l-4 border-[#004275]/20 overflow-y-auto">
                {rawTextLines.map((line, index) => (
                  <p key={`${line}-${index}`} className="mb-2">
                    {line}
                  </p>
                ))}
                {ocrResult?.processing_time && (
                  <p className="text-[#004275] font-bold mt-4">
                    _ OCR complete in {ocrResult.processing_time}s using {ocrResult.model_name || "configured model"}.
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="w-full md:w-1/2 bg-[#f0f4fd] p-4 sm:p-8 overflow-y-auto shadow-[-20px_0_40px_rgba(0,0,0,0.02)] z-10">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <div className="bg-white p-4 rounded-xl shadow-sm border-b-2 border-[#006970]">
                <p className="text-[10px] font-bold text-[#414750] uppercase tracking-tighter mb-2">
                  Confidence Score
                </p>
                <div className="flex items-end gap-1">
                  <span className="text-3xl font-['Public_Sans'] font-bold text-[#006970] tracking-tighter">
                    {confidenceScore}
                  </span>
                  <span className="text-xs text-[#006970] font-bold mb-1">%</span>
                </div>
              </div>
              <div className={`bg-white p-4 rounded-xl shadow-sm border-b-2 ${riskTone.border}`}>
                <p className="text-[10px] font-bold text-[#414750] uppercase tracking-tighter mb-2">
                  Risk Level
                </p>
                <div className="flex items-center gap-2">
                  <span className={`material-symbols-outlined ${riskTone.text}`}>verified_user</span>
                  <span className={`text-lg font-['Public_Sans'] font-bold ${riskTone.text}`}>
                    {validation ? riskTone.label : "Pending"}
                  </span>
                </div>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border-b-2 border-[#004275]">
                <p className="text-[10px] font-bold text-[#414750] uppercase tracking-tighter mb-2">
                  Compliance
                </p>
                <span className="px-2 py-0.5 bg-[#005a9c] text-[#afd1ff] text-[10px] font-bold rounded">
                  {complianceLabel}
                </span>
              </div>
            </div>

            <div className="bg-white rounded-xl p-8 shadow-sm">
              <h2 className="font-['Public_Sans'] font-bold text-lg text-[#004275] mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined">schema</span>
                Structured Extraction Results
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                {fieldConfig.map(({ label, key, col }) => (
                  <div key={key} className={`space-y-1 ${col === 2 ? "col-span-2" : ""}`}>
                    <label className="text-[10px] font-bold text-[#414750] uppercase tracking-widest">
                      {label}
                    </label>
                    <input
                      className="w-full bg-[#f0f4fd] border-none border-b border-[#c1c7d2]/30 focus:border-[#004275] focus:ring-0 text-sm font-medium py-2"
                      type="text"
                      value={formValues[key]}
                      onChange={(event) => onFieldUpdate(key, event.target.value)}
                    />
                  </div>
                ))}

                <div className="col-span-2 space-y-1">
                  <label className="text-[10px] font-bold text-[#414750] uppercase tracking-widest">
                    Composition
                  </label>
                  <textarea
                    className="w-full bg-[#f0f4fd] border-none border-b border-[#c1c7d2]/30 focus:border-[#004275] focus:ring-0 text-sm font-medium py-2 resize-none"
                    rows={2}
                    value={formValues.composition_summary}
                    onChange={(event) => onFieldUpdate("composition_summary", event.target.value)}
                  />
                </div>

                <div className="col-span-2 space-y-1">
                  <label className="text-[10px] font-bold text-[#414750] uppercase tracking-widest">
                    Storage Instructions
                  </label>
                  <input
                    className="w-full bg-[#f0f4fd] border-none border-b border-[#c1c7d2]/30 focus:border-[#004275] focus:ring-0 text-sm font-medium py-2"
                    type="text"
                    value={formValues.storage_conditions}
                    onChange={(event) => onFieldUpdate("storage_conditions", event.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="mt-8 bg-white/80 backdrop-blur-[12px] border-l-4 border-[#006970] p-6 rounded-r-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-['Public_Sans'] font-bold text-sm uppercase tracking-wider text-[#006970] flex items-center gap-2">
                  <span className="material-symbols-outlined">fact_check</span>
                  Compliance Summary
                </h3>
                <span className="text-xs text-[#414750] italic">
                  Source: Validation API
                </span>
              </div>
              <ul className="space-y-3">
                {complianceItems.map(({ icon, color, text }) => (
                  <li key={text} className="flex items-start gap-3">
                    <span className={`material-symbols-outlined text-lg ${color}`}>
                      {icon}
                    </span>
                    <span className="text-sm text-[#171c22]">{text}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-[#414750]">
              <div className="bg-white rounded-lg p-4 border border-[#c1c7d2]/20">
                <p className="font-bold uppercase tracking-widest mb-1">Linked IDs</p>
                <p>Document: {ocrResult?.document_id ?? "-"}</p>
                <p>OCR Result: {ocrResult?.ocr_result_id ?? "-"}</p>
                <p>Validation: {validation?.validation_result_id ?? "-"}</p>
              </div>
              <div className="bg-white rounded-lg p-4 border border-[#c1c7d2]/20">
                <p className="font-bold uppercase tracking-widest mb-1">File Metadata</p>
                <p>Name: {selectedFileName || "-"}</p>
                <p>Size: {ocrResult ? fileSizeLabel : "-"}</p>
                <p>Stored Path: {ocrResult?.stored_file_path || "-"}</p>
              </div>
            </div>

            <div className="mt-8 flex flex-col sm:flex-row gap-4">
              <button
                type="button"
                onClick={resetWorkspace}
                className="w-full sm:flex-1 py-4 bg-[#dee3eb] text-[#171c22] font-bold text-xs uppercase tracking-widest rounded-lg hover:bg-[#dee3eb]/80 transition-colors"
              >
                Discard Draft
              </button>
              <button
                type="button"
                onClick={onFinalize}
                disabled={!ocrResult || !validation || isSubmitting}
                className="w-full sm:flex-[2] py-4 text-white font-bold text-xs uppercase tracking-widest rounded-lg shadow-xl shadow-[#004275]/20 hover:scale-[1.01] active:scale-[0.98] transition-all disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
                style={{ background: "linear-gradient(135deg, #004275 0%, #005a9c 100%)" }}
              >
                {isSubmitting ? "Submitting..." : "Finalize & Submit Verification"}
              </button>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
