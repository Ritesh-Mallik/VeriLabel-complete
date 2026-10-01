import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import {
  runComparisonForVerifiedControl,
  getComparisonResult,
} from "../api/verilabelApi";

const fields = [
  { key: "name", label: "Medicine Name" },
  { key: "batch", label: "Batch Number" },
  { key: "manufacturer", label: "Manufacturer" },
  { key: "strength", label: "Strength" },
  { key: "dosageForm", label: "Dosage Form" },
  { key: "mfgDate", label: "MFG Date" },
  { key: "expDate", label: "EXP Date" },
  { key: "licenseNo", label: "License No" },
  { key: "composition", label: "Composition", multiline: true },
  { key: "storage", label: "Storage Instructions" },
  { key: "warnings", label: "Warnings", multiline: true },
  { key: "marketedBy", label: "Marketed By" },
];

const statusConfig = {
  verified: {
    label: "Verified",
    color: "text-[#006970]",
    bg: "bg-[#7af1fc]/20",
    dot: "bg-[#006970] animate-pulse",
  },
  review: {
    label: "Human Review",
    color: "text-[#6a3100]",
    bg: "bg-[#ffdcc7]",
    dot: "bg-[#6a3100]",
  },
  rejected: {
    label: "Rejected",
    color: "text-[#ba1a1a]",
    bg: "bg-[#ffdad6]/30",
    dot: "bg-[#ba1a1a]",
  },
};

function normalizeStatus(status) {
  if (status === "verified") {
    return "verified";
  }
  if (status === "needs_review" || status === "review" || status === "SUSPICIOUS") {
    return "review";
  }
  if (status === "PASS") {
    return "verified";
  }
  return "rejected";
}

function safeValue(value, fallback = "—") {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value === "string" && !value.trim()) {
    return fallback;
  }
  return value;
}

function formatDateTime(isoString) {
  if (!isoString) {
    return "Unknown";
  }

  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown";
  }

  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDate(isoString) {
  if (!isoString) {
    return "Unknown";
  }

  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown";
  }

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function parseDeviationList(deviations) {
  if (Array.isArray(deviations)) {
    return deviations;
  }

  if (typeof deviations === "string") {
    try {
      const parsed = JSON.parse(deviations);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  return [];
}

function getDeviationByField(deviations, fieldKey) {
  return deviations.find((item) => item.field === fieldKey || item.key === fieldKey) || null;
}

function mapReferenceRecord(rawData) {
  return {
    id: rawData?.id || null,
    name: safeValue(rawData?.drug_name, "Unidentified medicine"),
    batch: safeValue(rawData?.batch_number),
    manufacturer: safeValue(rawData?.manufacturer || rawData?.marketed_by),
    strength: safeValue(rawData?.strength),
    dosageForm: safeValue(rawData?.dosage_form),
    mfgDate: safeValue(rawData?.manufacturing_date),
    expDate: safeValue(rawData?.expiry_date),
    licenseNo: safeValue(rawData?.license_number),
    composition: safeValue(rawData?.composition_summary),
    storage: safeValue(rawData?.storage_conditions),
    warnings: safeValue(rawData?.analysis_summary, "No warnings extracted"),
    marketedBy: safeValue(rawData?.marketed_by),
    trustScore: rawData?.confidence_score ?? 0,
    status: normalizeStatus(rawData?.status),
    validatedAt: rawData?.validated_at || null,
    ocrResultId: rawData?.ocr_result_id || null,
    documentId: rawData?.document_id || null,
    raw: rawData || {},
  };
}

function buildIncomingFromComparisonPayload(comparisonData) {
  const validation = comparisonData?.validation || {};
  const comparison = comparisonData?.comparison || comparisonData?.data || {};

  return {
    id: validation?.id || comparison?.validation_result_id || null,
    name: safeValue(validation?.drug_name, "Incoming label"),
    batch: safeValue(validation?.batch_number),
    manufacturer: safeValue(validation?.manufacturer || validation?.marketed_by),
    strength: safeValue(validation?.strength),
    dosageForm: safeValue(validation?.dosage_form),
    mfgDate: safeValue(validation?.manufacturing_date),
    expDate: safeValue(validation?.expiry_date),
    licenseNo: safeValue(validation?.license_number),
    composition: safeValue(validation?.composition_summary),
    storage: safeValue(validation?.storage_conditions),
    warnings: safeValue(validation?.analysis_summary, "No warnings extracted"),
    marketedBy: safeValue(validation?.marketed_by),
    trustScore: validation?.confidence_score ?? comparison?.authenticity_score ?? 0,
    status: normalizeStatus(
      validation?.status || comparison?.final_decision || comparison?.status,
    ),
    validatedAt: validation?.validated_at || comparison?.compared_at || null,
    ocrResultId: validation?.ocr_result_id || comparison?.ocr_result_id || null,
    documentId: validation?.document_id || null,
    raw: {
      ...(validation || {}),
      comparison: comparison || {},
    },
  };
}

function buildFieldDifferences(referenceLabel, incomingLabel) {
  return fields
    .filter((field) => {
      const leftValue = referenceLabel[field.key];
      const rightValue = incomingLabel[field.key];
      return leftValue !== rightValue;
    })
    .map((field) => field.key);
}

function buildComplianceChecks(referenceLabel, incomingLabel, deviations) {
  const referenceChecks = [
    {
      icon: "check_circle",
      color: "text-[#006970]",
      text: "Reference label is already verified and approved.",
      fill: true,
    },
    {
      icon: "check_circle",
      color: "text-[#006970]",
      text: `Stored trust score: ${referenceLabel.trustScore}%.`,
      fill: true,
    },
    {
      icon: "check_circle",
      color: "text-[#006970]",
      text: `Reference batch: ${referenceLabel.batch}.`,
      fill: true,
    },
  ];

  const incomingChecks = [];

  if (deviations.length === 0) {
    incomingChecks.push({
      icon: "check_circle",
      color: "text-[#006970]",
      text: "No deviations detected in the incoming label.",
      fill: true,
    });
  } else {
    deviations.forEach((deviation) => {
      const severity = deviation.severity || "MINOR";
      const color = severity === "CRITICAL" ? "text-[#ba1a1a]" : "text-[#6a3100]";
      const icon = severity === "CRITICAL" ? "warning" : "info";
      const fieldLabel =
        fields.find((field) => field.key === deviation.field)?.label ||
        deviation.field ||
        deviation.word ||
        "Unknown field";

      const expected = deviation.expected || deviation.reference || deviation.word || "—";
      const found = deviation.found || deviation.production || deviation.word || "—";

      incomingChecks.push({
        icon,
        color,
        text: `${fieldLabel}: expected "${expected}" but found "${found}" (${deviation.type || "difference"}).`,
        fill: false,
      });
    });
  }

  return [
    { label: "Label A", data: referenceLabel, checks: referenceChecks },
    { label: "Label B", data: incomingLabel, checks: incomingChecks },
  ];
}

function buildAuditEntries(referenceLabel, incomingLabel, comparisonData) {
  const comparison = comparisonData?.comparison || comparisonData?.data || {};
  const comparedAt = comparison?.compared_at || null;

  return [
    {
      id: referenceLabel.id || "REFERENCE",
      title: "Reference Audit Log",
      accent: "#006970",
      items: [
        {
          icon: "history_edu",
          filled: true,
          bg: "bg-[#d2e4ff]",
          color: "text-[#004275]",
          title: "Reference Validation Finalized",
          time: formatDateTime(referenceLabel.validatedAt),
          extra: (
            <p className="text-[10px] font-mono mt-1 text-[#414750] bg-[#f0f4fd] p-2 rounded">
              Validation ID: {safeValue(referenceLabel.id)}
            </p>
          ),
        },
        {
          icon: "clinical_notes",
          filled: false,
          bg: "bg-[#dee3eb]",
          color: "text-[#414750]",
          title: "Reference OCR Linked",
          time: `OCR Result ID: ${safeValue(referenceLabel.ocrResultId)}`,
        },
        {
          icon: "description",
          filled: false,
          bg: "bg-[#dee3eb]",
          color: "text-[#414750]",
          title: "Reference Record Ready for Comparison",
          time: `Document ID: ${safeValue(referenceLabel.documentId)}`,
        },
      ],
    },
    {
      id: incomingLabel.id || "INCOMING",
      title: "Incoming Audit Log",
      accent: "#6a3100",
      items: [
        {
          icon: "upload",
          filled: false,
          bg: "bg-[#dee3eb]",
          color: "text-[#414750]",
          title: "Incoming File Uploaded",
          time: comparedAt ? formatDateTime(comparedAt) : "Awaiting upload",
        },
        {
          icon: "clinical_notes",
          filled: false,
          bg: "bg-[#dee3eb]",
          color: "text-[#414750]",
          title: "OCR Extraction Complete",
          time: `OCR Result ID: ${safeValue(incomingLabel.ocrResultId)}`,
        },
        {
          icon: "compare",
          filled: false,
          bg: "bg-[#dee3eb]",
          color: "text-[#414750]",
          title: "Comparison Initiated",
          time: comparedAt ? formatDateTime(comparedAt) : "Not yet started",
          extra:
            comparison?.audit_hash ? (
              <p className="text-[10px] font-mono mt-1 text-[#414750] bg-[#f0f4fd] p-2 rounded break-all">
                Audit Hash: {comparison.audit_hash}
              </p>
            ) : null,
        },
      ],
    },
  ];
}

function StatusBadge({ status }) {
  const mappedStatus = statusConfig[status] ? status : "review";
  const style = statusConfig[mappedStatus];

  return (
    <div
      className={`flex items-center gap-2 font-semibold text-xs px-3 py-1 rounded-full w-fit ${style.color} ${style.bg}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </div>
  );
}

function FieldRow({ field, valA, valB, isDiff, highlight, deviation }) {
  const severity = deviation?.severity || "";
  const hasCritical = severity === "CRITICAL";

  return (
    <div
      className={`grid grid-cols-1 sm:grid-cols-[1fr_40px_1fr] gap-0 items-start transition-colors ${
        isDiff && highlight ? "bg-[#ffdcc7]/20" : ""
      }`}
    >
      <div
        className={`p-3 rounded-l-lg ${
          isDiff && highlight ? "bg-[#ffdcc7]/30" : "bg-[#f0f4fd]"
        }`}
      >
        {field.multiline ? (
          <p
            className={`text-sm font-medium leading-relaxed ${
              isDiff && highlight ? "text-[#6a3100]" : "text-[#171c22]"
            }`}
          >
            {safeValue(valA)}
          </p>
        ) : (
          <p
            className={`text-sm font-medium ${
              isDiff && highlight ? "text-[#6a3100]" : "text-[#171c22]"
            }`}
          >
            {safeValue(valA)}
          </p>
        )}
      </div>

      <div className="flex items-center justify-center h-full min-h-[44px]">
        {isDiff ? (
          <span
            className={`material-symbols-outlined text-sm ${
              hasCritical ? "text-[#ba1a1a]" : "text-[#6a3100]"
            }`}
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            compare_arrows
          </span>
        ) : (
          <span
            className="material-symbols-outlined text-[#006970] text-sm"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            drag_handle
          </span>
        )}
      </div>

      <div
        className={`p-3 rounded-r-lg ${
          isDiff && highlight ? "bg-[#ffdcc7]/30" : "bg-[#f0f4fd]"
        }`}
      >
        {field.multiline ? (
          <p
            className={`text-sm leading-relaxed ${
              isDiff && highlight
                ? hasCritical
                  ? "text-[#ba1a1a] font-semibold"
                  : "text-[#6a3100] font-semibold"
                : "text-[#171c22] font-medium"
            }`}
          >
            {safeValue(valB)}
          </p>
        ) : (
          <p
            className={`text-sm ${
              isDiff && highlight
                ? hasCritical
                  ? "text-[#ba1a1a] font-semibold"
                  : "text-[#6a3100] font-semibold"
                : "text-[#171c22] font-medium"
            }`}
          >
            {safeValue(valB)}
          </p>
        )}

        {deviation?.type && (
          <p className="text-[10px] mt-1 uppercase tracking-widest text-[#414750]">
            {deviation.type.replaceAll("_", " ")}
          </p>
        )}
      </div>
    </div>
  );
}

export default function ComparisonPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { validationId: validationIdFromUrl } = useParams();

  const stateData = location.state || {};

  const validationId = stateData.validationId ?? validationIdFromUrl ?? null;
  const ocrResultId = stateData.ocrResultId ?? null;
  const data = stateData.data ?? null;
  const controlId =
    stateData.controlId ??
    data?.verified_control_id ??
    null;

  const [showDiffOnly, setShowDiffOnly] = useState(false);
  const [highlightDiffs, setHighlightDiffs] = useState(true);
  const [activeTab, setActiveTab] = useState("fields");
  const [selectedFile, setSelectedFile] = useState(null);
  const [isRunningComparison, setIsRunningComparison] = useState(false);
  const [comparisonId, setComparisonId] = useState(null);
  const [comparisonData, setComparisonData] = useState(null);
  const [isLoadingStoredComparison, setIsLoadingStoredComparison] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  console.log("===== COMPARISON PAGE DEBUG =====");
  console.log("location.pathname:", location.pathname);
  console.log("location.state:", location.state);
  console.log("validationIdFromUrl:", validationIdFromUrl);
  console.log("resolved validationId:", validationId);
  console.log("ocrResultId:", ocrResultId);
  console.log("controlId:", controlId);
  console.log("data:", data);
  console.log("=================================");

  const referenceLabel = useMemo(() => mapReferenceRecord(data || {}), [data]);

  const incomingLabel = useMemo(() => {
    if (!comparisonData) {
      return {
        id: null,
        name: "Awaiting upload",
        batch: "—",
        manufacturer: "—",
        strength: "—",
        dosageForm: "—",
        mfgDate: "—",
        expDate: "—",
        licenseNo: "—",
        composition: "Upload a new label to generate incoming values.",
        storage: "—",
        warnings: "—",
        marketedBy: "—",
        trustScore: 0,
        status: "review",
        validatedAt: null,
        ocrResultId: null,
        documentId: null,
        raw: {},
      };
    }

    return buildIncomingFromComparisonPayload(comparisonData);
  }, [comparisonData]);

  const deviations = useMemo(() => {
    if (!comparisonData) {
      return [];
    }
    return parseDeviationList(
      comparisonData?.comparison?.deviations || comparisonData?.data?.deviations || [],
    );
  }, [comparisonData]);

  const diffFields = useMemo(
    () => buildFieldDifferences(referenceLabel, incomingLabel),
    [referenceLabel, incomingLabel],
  );

  const visibleFields = useMemo(() => {
    return showDiffOnly ? fields.filter((field) => diffFields.includes(field.key)) : fields;
  }, [showDiffOnly, diffFields]);

  const totalDiffs = diffFields.length;
  const matchingCount = fields.length - totalDiffs;
  const matchPercentage =
    comparisonData?.comparison?.match_percentage ??
    comparisonData?.data?.match_percentage ??
    Math.round((matchingCount / fields.length) * 100);

  const authenticityScore =
    comparisonData?.comparison?.authenticity_score ??
    comparisonData?.data?.authenticity_score ??
    incomingLabel.trustScore ??
    0;

  const finalDecision =
    comparisonData?.comparison?.final_decision ??
    comparisonData?.data?.final_decision ??
    "PENDING";

  const comparisonStatus =
    comparisonData?.comparison?.status ??
    comparisonData?.data?.status ??
    "PENDING";

  const complianceCards = useMemo(
    () => buildComplianceChecks(referenceLabel, incomingLabel, deviations),
    [referenceLabel, incomingLabel, deviations],
  );

  const auditCards = useMemo(
    () => buildAuditEntries(referenceLabel, incomingLabel, comparisonData),
    [referenceLabel, incomingLabel, comparisonData],
  );

  useEffect(() => {
    if (!location.state && !validationIdFromUrl) {
      console.log("No location.state and no URL param. Redirecting to /records");
      navigate("/records");
    }
  }, [location.state, validationIdFromUrl, navigate]);

  useEffect(() => {
    async function loadStoredComparison() {
      if (!comparisonId) {
        return;
      }

      try {
        setIsLoadingStoredComparison(true);
        console.log("Loading stored comparison for comparisonId:", comparisonId);
        const result = await getComparisonResult(comparisonId);
        console.log("Stored comparison result:", result);

        setComparisonData((previous) => ({
          ...(previous || {}),
          comparison: result,
        }));
      } catch (error) {
        console.error("Failed to load stored comparison result:", error);
        setErrorMessage(error.message || "Failed to load stored comparison result.");
      } finally {
        setIsLoadingStoredComparison(false);
      }
    }

    loadStoredComparison();
  }, [comparisonId]);

  async function handleRunComparison() {
    console.log("===== RUN COMPARISON CLICKED =====");
    console.log("controlId:", controlId);
    console.log("validationId:", validationId);
    console.log("ocrResultId:", ocrResultId);
    console.log("selectedFile:", selectedFile);
    console.log("==================================");

    if (!controlId) {
      setErrorMessage(
    "Backend error: verified_control_id missing.\nEnsure /api/validation/latest returns it."
  );
      console.error("Comparison blocked because controlId is missing.");
      return;
    }

    if (!selectedFile) {
      setErrorMessage("Please upload a new label file before running comparison.");
      console.error("Comparison blocked because no file was selected.");
      return;
    }

    try {
      setIsRunningComparison(true);
      setErrorMessage("");
      setStatusMessage("");

      console.log("Calling runComparisonForVerifiedControl with:");
      console.log("controlId:", controlId);
      console.log("file:", selectedFile);

      const result = await runComparisonForVerifiedControl(controlId, selectedFile);

      console.log("Comparison API result:", result);

      const comparisonPayload = {
        comparison: result?.data || {},
        validation: result?.validation || {},
      };

      setComparisonData(comparisonPayload);
      setComparisonId(result?.data?.id || null);
      setStatusMessage("Comparison completed successfully.");
      setActiveTab("fields");
    } catch (error) {
      console.error("Comparison failed:", error);
      setErrorMessage(error.message || "Comparison failed.");
    } finally {
      setIsRunningComparison(false);
    }
  }

  function handleExportReport() {
    if (!comparisonData) {
      setStatusMessage("Run a comparison first to export a real report.");
      return;
    }

    const reportPayload = {
      reference: referenceLabel,
      incoming: incomingLabel,
      comparison: comparisonData?.comparison || comparisonData?.data || {},
      deviations,
    };

    const blob = new Blob([JSON.stringify(reportPayload, null, 2)], {
      type: "application/json",
    });

    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `comparison-report-${comparisonId || "latest"}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(objectUrl);
  }

  return (
    <div
      className="bg-[#f8f9ff] text-[#171c22]"
      style={{ fontFamily: "Inter, sans-serif" }}
    >
      <Navbar />
      <div className="flex flex-col lg:flex-row overflow-visible lg:h-[calc(100vh-72px)] lg:overflow-hidden">
        <main className="flex-1 flex flex-col overflow-visible lg:overflow-hidden">
          <div className="px-4 sm:px-10 pt-6 sm:pt-8 pb-5 flex flex-col lg:flex-row lg:justify-between lg:items-end gap-4 shrink-0 border-b border-[#c1c7d2]/20 bg-[#f8f9ff]">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="material-symbols-outlined text-[#004275]">difference</span>
                <h1
                  className="font-extrabold text-3xl tracking-tight text-[#004275]"
                  style={{ fontFamily: "Public Sans, sans-serif" }}
                >
                  Label Comparison
                </h1>
              </div>
              <p className="text-[#414750] text-sm">
                Side-by-side analysis of stored verified data against a newly uploaded label
                {" · "}
                {comparisonData
                  ? `${totalDiffs} discrepanc${totalDiffs === 1 ? "y" : "ies"} detected`
                  : "upload a file to begin comparison"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setShowDiffOnly(!showDiffOnly)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors ${
                  showDiffOnly
                    ? "bg-[#004275] text-white"
                    : "bg-white text-[#171c22] border border-[#c1c7d2]/30 hover:bg-[#f0f4fd]"
                }`}
              >
                <span className="material-symbols-outlined text-sm">filter_alt</span>
                Differences Only
              </button>

              <button
                type="button"
                onClick={() => setHighlightDiffs(!highlightDiffs)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors ${
                  highlightDiffs
                    ? "bg-[#ffdcc7] text-[#6a3100]"
                    : "bg-white text-[#171c22] border border-[#c1c7d2]/30 hover:bg-[#f0f4fd]"
                }`}
              >
                <span className="material-symbols-outlined text-sm">highlight</span>
                Highlight
              </button>

              <button
                type="button"
                onClick={handleExportReport}
                className="flex items-center gap-2 px-4 py-2 text-white rounded-lg text-xs font-bold uppercase tracking-widest transition-all hover:scale-[1.01]"
                style={{ background: "linear-gradient(135deg, #004275 0%, #005a9c 100%)" }}
              >
                <span className="material-symbols-outlined text-sm">download</span>
                Export Report
              </button>
            </div>
          </div>

          {(errorMessage || statusMessage) && (
            <div className="px-4 sm:px-10 pt-4 shrink-0">
              {errorMessage && (
                <div className="rounded-lg border border-[#ba1a1a]/20 bg-[#ffdad6]/40 px-4 py-3 text-sm text-[#ba1a1a] mb-3">
                  {errorMessage}
                </div>
              )}
              {statusMessage && (
                <div className="rounded-lg border border-[#004275]/20 bg-[#d2e4ff]/30 px-4 py-3 text-sm text-[#004275]">
                  {statusMessage}
                </div>
              )}
            </div>
          )}

          <div className="flex-1 flex flex-col lg:flex-row overflow-visible lg:overflow-hidden">
            <div className="flex-1 flex flex-col overflow-visible lg:overflow-hidden px-4 sm:px-10 py-6 gap-6">
              <div className="bg-white rounded-xl border border-[#c1c7d2]/20 p-5 shrink-0">
                <div className="flex flex-wrap items-end gap-4">
                  <div className="flex-1 min-w-[260px]">
                    <p className="text-[10px] font-bold text-[#414750] uppercase tracking-widest mb-2">
                      Upload Incoming Label
                    </p>
                    <input
                      type="file"
                      accept=".png,.jpg,.jpeg,.pdf,.webp"
                      onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                      className="w-full text-sm text-[#171c22] file:mr-4 file:px-4 file:py-2 file:rounded-lg file:border-0 file:text-xs file:font-bold file:uppercase file:tracking-widest file:bg-[#f0f4fd] file:text-[#004275] hover:file:bg-[#dfe9ff]"
                    />
                    <p className="text-[11px] text-[#414750] mt-2">
                      Verified Control ID: {safeValue(controlId)} · Validation ID: {safeValue(validationId)} · OCR Result ID: {safeValue(ocrResultId)}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleRunComparison}
                    disabled={isRunningComparison || !selectedFile}
                    className="flex items-center gap-2 px-5 py-3 text-white rounded-lg text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{ background: "linear-gradient(135deg, #006970 0%, #0097a7 100%)" }}
                  >
                    <span className="material-symbols-outlined text-sm">compare</span>
                    {isRunningComparison ? "Running..." : "Run Comparison"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_40px_1fr] gap-0 shrink-0">
                <div className="bg-white rounded-t-xl sm:rounded-l-xl sm:rounded-tr-none border border-[#c1c7d2]/20 sm:border-r-0 p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <span className="text-[10px] font-bold text-[#004275] uppercase tracking-widest mb-1 block">
                        Label A · Reference
                      </span>
                      <h2
                        className="font-bold text-xl text-[#171c22] leading-tight"
                        style={{ fontFamily: "Public Sans, sans-serif" }}
                      >
                        {referenceLabel.name}
                      </h2>
                      <p className="text-xs text-[#414750] font-mono mt-0.5">
                        {referenceLabel.batch}
                      </p>
                    </div>
                    <StatusBadge status={referenceLabel.status} />
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#c1c7d2]/15">
                    <div>
                      <p className="text-[10px] text-[#414750] uppercase tracking-widest mb-1">
                        Trust Score
                      </p>
                      <p
                        className="text-2xl font-bold text-[#006970]"
                        style={{ fontFamily: "Public Sans, sans-serif" }}
                      >
                        {referenceLabel.trustScore}%
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-[#414750] uppercase tracking-widest mb-1">
                        Verified
                      </p>
                      <p className="text-sm font-semibold text-[#171c22]">
                        {formatDate(referenceLabel.validatedAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-[#414750] uppercase tracking-widest mb-1">
                        Validation
                      </p>
                      <p className="text-sm font-semibold text-[#171c22]">
                        ID: {safeValue(referenceLabel.id)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-[#004275] flex items-center justify-center py-2 sm:py-0">
                  <span
                    className="material-symbols-outlined text-white text-sm rotate-90 sm:rotate-0"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    swap_horiz
                  </span>
                </div>

                <div className="bg-white rounded-b-xl sm:rounded-r-xl sm:rounded-bl-none border border-[#c1c7d2]/20 border-t-0 sm:border-t sm:border-l-0 p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <span className="text-[10px] font-bold text-[#6a3100] uppercase tracking-widest mb-1 block">
                        Label B · Incoming
                      </span>
                      <h2
                        className="font-bold text-xl text-[#171c22] leading-tight"
                        style={{ fontFamily: "Public Sans, sans-serif" }}
                      >
                        {incomingLabel.name}
                      </h2>
                      <p className="text-xs text-[#414750] font-mono mt-0.5">
                        {incomingLabel.batch}
                      </p>
                    </div>
                    <StatusBadge status={incomingLabel.status} />
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#c1c7d2]/15">
                    <div>
                      <p className="text-[10px] text-[#414750] uppercase tracking-widest mb-1">
                        Trust Score
                      </p>
                      <p
                        className="text-2xl font-bold text-[#6a3100]"
                        style={{ fontFamily: "Public Sans, sans-serif" }}
                      >
                        {incomingLabel.trustScore}%
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-[#414750] uppercase tracking-widest mb-1">
                        Compared
                      </p>
                      <p className="text-sm font-semibold text-[#171c22]">
                        {comparisonData
                          ? formatDate(
                              comparisonData?.comparison?.compared_at ||
                                comparisonData?.data?.compared_at,
                            )
                          : "Pending"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-[#414750] uppercase tracking-widest mb-1">
                        Comparison
                      </p>
                      <p className="text-sm font-semibold text-[#171c22]">
                        ID: {safeValue(comparisonId)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-1 bg-[#f0f4fd] rounded-lg p-1 shrink-0">
                {["fields", "compliance", "audit"].map((tabName) => (
                  <button
                    key={tabName}
                    type="button"
                    onClick={() => setActiveTab(tabName)}
                    className={`px-5 py-2 text-xs font-bold uppercase tracking-widest rounded-md transition-colors capitalize ${
                      activeTab === tabName
                        ? "bg-white text-[#004275] shadow-sm"
                        : "text-[#414750] hover:text-[#171c22]"
                    }`}
                  >
                    {tabName === "fields"
                      ? "Field Comparison"
                      : tabName === "compliance"
                        ? "Compliance Check"
                        : "Audit Trail"}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto">
                {isLoadingStoredComparison && (
                  <div className="bg-white rounded-xl p-6 border border-[#c1c7d2]/20 text-sm text-[#414750] mb-4">
                    Loading stored comparison result...
                  </div>
                )}

                {activeTab === "fields" && (
                  <div className="space-y-2">
                    <div className="hidden sm:grid grid-cols-[1fr_40px_1fr] gap-0 mb-3">
                      <div className="flex items-center gap-2 px-3">
                        <span className="w-2 h-2 rounded-full bg-[#006970]" />
                        <span className="text-[11px] font-bold text-[#414750] uppercase tracking-widest">
                          Label A — Reference
                        </span>
                      </div>
                      <div />
                      <div className="flex items-center gap-2 px-3">
                        <span className="w-2 h-2 rounded-full bg-[#6a3100]" />
                        <span className="text-[11px] font-bold text-[#414750] uppercase tracking-widest">
                          Label B — Incoming
                        </span>
                      </div>
                    </div>

                    {visibleFields.map((field) => {
                      const isDiff = diffFields.includes(field.key);
                      const deviation = getDeviationByField(deviations, field.key);

                      return (
                        <div key={field.key} className="rounded-xl overflow-hidden">
                          <div className="grid grid-cols-1 sm:grid-cols-[1fr_40px_1fr] gap-0">
                            <div className="px-3 pt-3 pb-1">
                              <p className="text-[10px] font-bold text-[#414750] uppercase tracking-widest flex items-center gap-1.5">
                                {isDiff && (
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full ${
                                      deviation?.severity === "CRITICAL"
                                        ? "bg-[#ba1a1a]"
                                        : "bg-[#6a3100]"
                                    } shrink-0`}
                                  />
                                )}
                                {field.label}
                                <span className="sm:hidden normal-case text-[9px] text-[#006970]">· Reference</span>
                              </p>
                            </div>
                            <div />
                            <div className="px-3 pt-3 pb-1">
                              <p className="text-[10px] font-bold text-[#414750] uppercase tracking-widest">
                                {field.label}
                                <span className="sm:hidden normal-case text-[9px] text-[#6a3100] ml-1.5">· Incoming</span>
                              </p>
                            </div>
                          </div>

                          <FieldRow
                            field={field}
                            valA={referenceLabel[field.key]}
                            valB={incomingLabel[field.key]}
                            isDiff={isDiff}
                            highlight={highlightDiffs}
                            deviation={deviation}
                          />
                        </div>
                      );
                    })}

                    {showDiffOnly && visibleFields.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-20 text-[#414750]">
                        <span
                          className="material-symbols-outlined text-4xl text-[#006970] mb-3"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          check_circle
                        </span>
                        <p className="font-semibold text-[#171c22]">No differences found</p>
                        <p className="text-sm mt-1">
                          Both labels are identical across all tracked fields.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "compliance" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {complianceCards.map(({ label, data, checks }) => (
                      <div key={label} className="bg-white rounded-xl p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-5">
                          <h3
                            className="font-bold text-sm uppercase tracking-widest text-[#004275]"
                            style={{ fontFamily: "Public Sans, sans-serif" }}
                          >
                            {label}
                          </h3>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-[#414750] uppercase tracking-widest">
                              Score
                            </span>
                            <span
                              className={`text-lg font-bold ${
                                data.trustScore >= 95 ? "text-[#006970]" : "text-[#6a3100]"
                              }`}
                              style={{ fontFamily: "Public Sans, sans-serif" }}
                            >
                              {data.trustScore}%
                            </span>
                          </div>
                        </div>

                        <div className="h-1.5 bg-[#f0f4fd] rounded-full overflow-hidden mb-5">
                          <div
                            className={`h-full rounded-full transition-all ${
                              data.trustScore >= 95 ? "bg-[#006970]" : "bg-[#6a3100]"
                            }`}
                            style={{ width: `${Math.max(0, Math.min(100, data.trustScore))}%` }}
                          />
                        </div>

                        <ul className="space-y-3">
                          {checks.map((check, index) => (
                            <li key={`${label}-${index}`} className="flex items-start gap-3">
                              <span
                                className={`material-symbols-outlined text-lg shrink-0 ${check.color}`}
                                style={check.fill ? { fontVariationSettings: "'FILL' 1" } : {}}
                              >
                                {check.icon}
                              </span>
                              <span className="text-sm text-[#171c22] leading-snug">
                                {check.text}
                              </span>
                            </li>
                          ))}
                        </ul>

                        <div className="mt-5 pt-5 border-t border-[#c1c7d2]/15">
                          <span className="text-[10px] text-[#414750] italic">
                            {label === "Label A"
                              ? "Trusted reference record"
                              : `Final decision: ${finalDecision} · Comparison status: ${comparisonStatus}`}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === "audit" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {auditCards.map((card) => (
                      <div key={card.id} className="bg-white rounded-xl p-6 shadow-sm">
                        <h3
                          className="font-bold text-sm uppercase tracking-widest mb-5 flex items-center gap-2"
                          style={{ fontFamily: "Public Sans, sans-serif", color: card.accent }}
                        >
                          <span
                            className="w-1 h-3 rounded-full"
                            style={{ background: card.accent }}
                          />
                          {card.title}
                        </h3>

                        <div className="space-y-4 relative before:content-[''] before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-px before:bg-[#c1c7d2]/30">
                          {card.items.map((item, index) => (
                            <div key={`${card.id}-${index}`} className="flex gap-4 relative">
                              <div
                                className={`w-[22px] h-[22px] rounded-full ${item.bg} flex items-center justify-center z-10 shrink-0`}
                              >
                                <span
                                  className={`material-symbols-outlined text-[14px] ${item.color}`}
                                  style={item.filled ? { fontVariationSettings: "'FILL' 1" } : {}}
                                >
                                  {item.icon}
                                </span>
                              </div>
                              <div className="flex-1">
                                <p className="text-xs font-bold text-[#171c22] leading-none mb-1">
                                  {item.title}
                                </p>
                                <p className="text-[10px] text-[#414750]">{item.time}</p>
                                {item.extra}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="w-full lg:w-72 bg-white border-t lg:border-t-0 lg:border-l border-[#c1c7d2]/20 flex flex-col overflow-y-auto shrink-0">
              <div className="p-6 border-b border-[#c1c7d2]/10">
                <h3 className="text-xs font-bold text-[#171c22] uppercase tracking-widest mb-4 flex items-center gap-2">
                  <span className="w-1 h-3 bg-[#004275] rounded-full" />
                  Comparison Summary
                </h3>

                <div className="space-y-3">
                  {[
                    { label: "Total Fields", value: fields.length, color: "text-[#171c22]" },
                    { label: "Matching", value: matchingCount, color: "text-[#006970]" },
                    { label: "Discrepancies", value: totalDiffs, color: "text-[#6a3100]" },
                    {
                      label: "Authenticity",
                      value: `${authenticityScore}%`,
                      color: authenticityScore >= 90 ? "text-[#006970]" : "text-[#6a3100]",
                    },
                  ].map(({ label, value, color }) => (
                    <div
                      key={label}
                      className="flex justify-between items-center bg-[#f0f4fd] px-3 py-2 rounded-lg"
                    >
                      <span className="text-xs text-[#414750]">{label}</span>
                      <span className={`text-sm font-bold ${color}`}>{value}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-4">
                  <div className="flex justify-between text-[10px] text-[#414750] mb-1">
                    <span className="uppercase tracking-widest">Match rate</span>
                    <span className="font-bold">{matchPercentage}%</span>
                  </div>
                  <div className="h-2 bg-[#f0f4fd] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#006970] rounded-full"
                      style={{ width: `${Math.max(0, Math.min(100, matchPercentage))}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="p-6 border-b border-[#c1c7d2]/10">
                <h3 className="text-xs font-bold text-[#171c22] uppercase tracking-widest mb-4 flex items-center gap-2">
                  <span className="w-1 h-3 bg-[#6a3100] rounded-full" />
                  Flagged Fields
                </h3>
                <div className="space-y-2">
                  {diffFields.length > 0 ? (
                    fields
                      .filter((field) => diffFields.includes(field.key))
                      .map((field) => {
                        const deviation = getDeviationByField(deviations, field.key);
                        return (
                          <div
                            key={field.key}
                            className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
                              deviation?.severity === "CRITICAL"
                                ? "text-[#ba1a1a] bg-[#ffdad6]/60"
                                : "text-[#6a3100] bg-[#ffdcc7]/40"
                            }`}
                          >
                            <span className="material-symbols-outlined text-sm">flag</span>
                            {field.label}
                          </div>
                        );
                      })
                  ) : (
                    <div className="text-xs text-[#414750] bg-[#f0f4fd] px-3 py-2 rounded-lg">
                      No flagged fields yet.
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6 border-b border-[#c1c7d2]/10">
                <h3 className="text-xs font-bold text-[#171c22] uppercase tracking-widest mb-3 flex items-center gap-2">
                  <span className="w-1 h-3 bg-[#6a3100] rounded-full" />
                  Recommendation
                </h3>
                <div className="bg-[#ffdcc7]/30 border-l-4 border-[#6a3100] p-3 rounded-r-lg">
                  <p className="text-xs text-[#6a3100] font-semibold mb-1">
                    {comparisonData ? finalDecision : "Awaiting Comparison"}
                  </p>
                  <p className="text-xs text-[#414750] leading-relaxed">
                    {comparisonData
                      ? totalDiffs > 0
                        ? `${totalDiffs} field${totalDiffs !== 1 ? "s" : ""} differ between the verified reference and uploaded label. Review all flagged deviations before approval.`
                        : "No meaningful differences were detected. Incoming label is aligned with the verified reference."
                      : "Upload a new label and run the comparison to generate a decision report."}
                  </p>
                </div>
              </div>

              <div className="p-6 space-y-3 mt-auto">
                <button
                  type="button"
                  disabled={!comparisonData || finalDecision !== "VALID"}
                  className="w-full flex items-center justify-center gap-2 py-3 text-white rounded-lg text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ background: "linear-gradient(135deg, #004275 0%, #005a9c 100%)" }}
                >
                  <span className="material-symbols-outlined text-sm">task_alt</span>
                  Approve Label B
                </button>

                <button
                  type="button"
                  disabled={!comparisonData}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-[#ffdad6]/40 text-[#ba1a1a] rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-[#ffdad6]/70 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-sm">cancel</span>
                  Reject Label B
                </button>

                <button
                  type="button"
                  onClick={handleExportReport}
                  className="w-full flex items-center justify-center gap-2 py-3 border border-[#c1c7d2]/30 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-[#f0f4fd] transition-colors text-[#414750]"
                >
                  <span className="material-symbols-outlined text-sm">print</span>
                  Export Report
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}