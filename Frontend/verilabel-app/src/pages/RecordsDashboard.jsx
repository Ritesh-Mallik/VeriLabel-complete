import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import {
  exportValidationResults,
  getLatestValidationRecords,
  updateValidationResult,
} from "../api/verilabelApi";

const editableFieldConfig = [
  { label: "Medicine Name", key: "drug_name" },
  { label: "Strength", key: "strength" },
  { label: "Dosage Form", key: "dosage_form" },
  { label: "Batch No", key: "batch_number" },
  { label: "MFG Date", key: "manufacturing_date" },
  { label: "EXP Date", key: "expiry_date" },
  { label: "Manufacturer", key: "manufacturer" },
  { label: "Marketed By", key: "marketed_by" },
  { label: "License No", key: "license_number" },
  { label: "Package Type", key: "package_type" },
];

const riskStyles = {
  low: {
    wrapper: "text-[#006970] bg-[#7af1fc]/20",
    dot: "bg-[#006970] animate-pulse",
    label: "Low Risk",
  },
  review: {
    wrapper: "text-[#6a3100] bg-[#ffdcc7]",
    dot: "bg-[#6a3100]",
    label: "Human Review",
  },
  rejected: {
    wrapper: "text-[#ba1a1a] bg-[#ffdad6]/30",
    dot: "bg-[#ba1a1a]",
    label: "Rejected",
  },
};

function toRiskType(status) {
  if (status === "verified") {
    return "low";
  }
  if (status === "needs_review") {
    return "review";
  }
  return "rejected";
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

function mapRecord(validationRow) {
  const riskType = toRiskType(validationRow.status);

  return {
    id: validationRow.id,
    name: validationRow.drug_name || "Unidentified medicine",
    batch: validationRow.batch_number || "Unavailable",
    manufacturer: validationRow.manufacturer || validationRow.marketed_by || "Unknown",
    date: formatDate(validationRow.validated_at),
    dateTime: formatDateTime(validationRow.validated_at),
    risk:
      validationRow.status === "verified"
        ? "Verified"
        : validationRow.status === "needs_review"
          ? "Needs Review"
          : "Rejected",
    riskType,
    confidence: validationRow.confidence_score ?? 0,
    raw: validationRow,
  };
}

function normalizeMissingFields(missingFields) {
  if (Array.isArray(missingFields)) {
    return missingFields;
  }
  return [];
}

export default function RecordsDashboard() {
  const [records, setRecords] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState("All");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [isSavingEdits, setIsSavingEdits] = useState(false);
  const [editValues, setEditValues] = useState({});

  const navigate = useNavigate();

  function resolveControlId(raw) {
  return (
    raw?.verified_control_id ??
    raw?.control_id ??
    raw?.verifiedControlId ??
    raw?.reference_control_id ??
    raw?.referenceControlId ??
    raw?.master_control_id ??
    raw?.masterControlId ??
    null
  );
}

function handleCompare(record) {
  const controlId = resolveControlId(record.raw);

  console.log("===== HANDLE COMPARE DEBUG =====");
  console.log("validationId:", record.id);
  console.log("ocrResultId:", record.raw?.ocr_result_id);
  console.log("verified_control_id:", record.raw?.verified_control_id);
  console.log("resolved controlId:", controlId);
  console.log("FULL RAW:", record.raw);
  console.log("================================");

  if (!controlId) {
    alert(
      "Backend issue: verified_control_id is missing in /api/validation/latest response.\nFix backend to include it."
    );
    return;
  }

  navigate(`/compare/${record.id}`, {
    state: {
      validationId: record.id,
      ocrResultId: record.raw?.ocr_result_id ?? null,
      controlId: controlId,
      data: record.raw,
    },
  });
}

  useEffect(() => {
    let isMounted = true;

    async function loadRecords() {
      try {
        setIsLoading(true);
        setErrorMessage("");

        const latestRows = await getLatestValidationRecords(100);
        console.log("LATEST VALIDATION ROWS:", latestRows);

        const mapped = latestRows.map(mapRecord);

        if (!isMounted) {
          return;
        }

        setRecords(mapped);
        setSelectedId(mapped.length > 0 ? mapped[0].id : null);
      } catch (error) {
        if (!isMounted) {
          return;
        }
        setErrorMessage(error.message || "Failed to load validation records.");
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadRecords();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredRecords = useMemo(() => {
    if (tab === "Flagged") {
      return records.filter((record) => record.raw.status !== "verified");
    }
    if (tab === "Success") {
      return records.filter((record) => record.raw.status === "verified");
    }
    return records;
  }, [records, tab]);

  const selected = useMemo(() => {
    if (selectedId === null) {
      return null;
    }
    return filteredRecords.find((record) => record.id === selectedId) || null;
  }, [filteredRecords, selectedId]);

  useEffect(() => {
    if (!selected) {
      setEditValues({});
      return;
    }
    setEditValues({
      drug_name: selected.raw.drug_name || "",
      strength: selected.raw.strength || "",
      dosage_form: selected.raw.dosage_form || "",
      batch_number: selected.raw.batch_number || "",
      manufacturing_date: selected.raw.manufacturing_date || "",
      expiry_date: selected.raw.expiry_date || "",
      manufacturer: selected.raw.manufacturer || "",
      marketed_by: selected.raw.marketed_by || "",
      license_number: selected.raw.license_number || "",
      package_type: selected.raw.package_type || "",
      composition_summary: selected.raw.composition_summary || "",
      storage_conditions: selected.raw.storage_conditions || "",
    });
  }, [selected]);

  useEffect(() => {
    if (filteredRecords.length === 0) {
      setSelectedId(null);
      return;
    }
    if (selectedId === null) {
      return;
    }
    const exists = filteredRecords.some((record) => record.id === selectedId);
    if (!exists) {
      setSelectedId(filteredRecords[0].id);
    }
  }, [filteredRecords, selectedId]);

  async function onExportValidationResults() {
    try {
      setIsExporting(true);
      setStatusMessage("");
      const payload = await exportValidationResults();
      const outputFile = payload?.output_file || "export path unavailable";
      setStatusMessage(`Validation records exported to: ${outputFile}`);
    } catch (error) {
      setErrorMessage(error.message || "Failed to export validation results.");
    } finally {
      setIsExporting(false);
    }
  }

  async function onShareSummary() {
    if (!selected) {
      return;
    }

    const missingFields = normalizeMissingFields(selected.raw.missing_fields);
    const summaryLines = [
      `Medicine: ${selected.name}`,
      `Batch: ${selected.batch}`,
      `Manufacturer: ${selected.manufacturer}`,
      `Risk: ${selected.raw.status === "verified" ? "VERIFIED" : "NEEDS REVIEW"}`,
      `Confidence: ${selected.confidence}%`,
      `Missing Fields: ${missingFields.length > 0 ? missingFields.join(", ") : "None"}`,
      `Validated At: ${selected.dateTime}`,
    ];

    try {
      await navigator.clipboard.writeText(summaryLines.join("\n"));
      setStatusMessage("Summary copied to clipboard.");
    } catch (_) {
      setStatusMessage("Clipboard is unavailable in this browser context.");
    }
  }

  function onEditFieldUpdate(key, value) {
    setEditValues((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  async function onSaveStructuredEdits() {
    if (!selected?.id) {
      return;
    }

    try {
      setIsSavingEdits(true);
      setErrorMessage("");
      const updatedRow = await updateValidationResult(selected.id, editValues);
      setRecords((previous) =>
        previous.map((record) => (record.id === updatedRow.id ? mapRecord(updatedRow) : record)),
      );
      setStatusMessage("Structured extraction values updated successfully.");
    } catch (error) {
      setErrorMessage(error.message || "Failed to update record.");
    } finally {
      setIsSavingEdits(false);
    }
  }

  return (
    <div
      className="bg-[#f8f9ff] text-[#171c22] min-h-screen md:h-screen flex flex-col overflow-visible md:overflow-hidden"
      style={{ fontFamily: "Inter, sans-serif" }}
    >
      <Navbar />
      <div className="flex flex-1 overflow-visible md:overflow-hidden">
        <main className="flex-1 flex flex-col min-w-0 bg-[#f8f9ff]">
          <div className="px-4 sm:px-10 pt-6 sm:pt-10 pb-6 flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
            <div>
              <h1
                className="font-bold text-3xl text-[#171c22] tracking-tight mb-2"
                style={{ fontFamily: "Public Sans, sans-serif" }}
              >
                My Records
              </h1>
              <p className="text-[#414750] text-sm">
                Reviewing {records.length} total extraction certificates
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="flex bg-[#f0f4fd] rounded-lg p-1">
                {["All", "Flagged", "Success"].map((value) => (
                  <button
                    key={value}
                    onClick={() => setTab(value)}
                    className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-md transition-colors ${
                      tab === value
                        ? "bg-white text-[#004275] shadow-sm"
                        : "text-[#414750] hover:text-[#171c22]"
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setStatusMessage("Use the tabs to filter by risk level.")}
                className="flex items-center gap-2 px-4 py-2 bg-white text-[#171c22] text-xs font-bold uppercase tracking-widest rounded-lg shadow-sm hover:bg-[#f0f4fd] transition-colors"
              >
                <span className="material-symbols-outlined text-sm">filter_list</span>
                Filters
              </button>
            </div>
          </div>

          <div className="px-4 sm:px-10 pb-3">
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
          </div>

          <div className="flex-1 flex flex-col lg:flex-row overflow-visible lg:overflow-hidden px-4 sm:px-10 pb-10 gap-6 lg:gap-8">
            <div className="flex-1 flex flex-col bg-white rounded-xl shadow-sm overflow-hidden min-w-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#f0f4fd]">
                      {["Medicine Name", "Batch Number", "Manufacturer", "Verification Date", "Risk Level", ""].map(
                        (header) => (
                          <th
                            key={header}
                            className="px-6 py-4 text-[11px] font-bold text-[#414750] uppercase tracking-widest"
                          >
                            {header}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#c1c7d2]/10">
                    {isLoading && (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-sm text-[#414750]">
                          Loading records from backend...
                        </td>
                      </tr>
                    )}

                    {!isLoading && filteredRecords.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-sm text-[#414750]">
                          No records found for the selected filter.
                        </td>
                      </tr>
                    )}

                    {!isLoading &&
                      filteredRecords.map((record) => {
                        const isActive = selected?.id === record.id;
                        const style = riskStyles[record.riskType];
                        return (
                          <tr
                            key={record.id}
                            onClick={() => setSelectedId(record.id)}
                            className={`cursor-pointer transition-colors group relative ${
                              isActive ? "bg-[#f0f4fd]" : "hover:bg-[#f0f4fd]/50"
                            }`}
                          >
                            <td className="px-6 py-5 relative">
                              {isActive && (
                                <div className="w-1 h-8 bg-[#004275] absolute left-0 top-1/2 -translate-y-1/2 rounded-r" />
                              )}
                              <span className="font-semibold text-[#171c22] text-sm">{record.name}</span>
                            </td>
                            <td className="px-6 py-5 text-sm text-[#414750] font-mono">{record.batch}</td>
                            <td className="px-6 py-5 text-sm text-[#414750]">{record.manufacturer}</td>
                            <td className="px-6 py-5 text-sm text-[#414750]">{record.date}</td>
                            <td className="px-6 py-5">
                              <div
                                className={`flex items-center gap-2 font-semibold text-xs px-3 py-1 rounded-full w-fit ${style.wrapper}`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                                {record.risk}
                              </div>
                            </td>
                            <td className="px-6 py-5 text-right">
                              <span className="material-symbols-outlined text-[#c1c7d2] group-hover:text-[#004275] transition-colors">
                                chevron_right
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
              <div className="mt-auto border-t border-[#c1c7d2]/10 p-4 flex justify-between items-center bg-white">
                <span className="text-xs text-[#414750] font-medium">
                  Showing {filteredRecords.length} of {records.length} records
                </span>
                <div className="text-xs text-[#414750] font-semibold uppercase tracking-wider">
                  Live API Data
                </div>
              </div>
            </div>

            {selected && (
              <div className="w-full lg:w-[420px] bg-white rounded-xl shadow-sm flex flex-col overflow-hidden shrink-0">
                <div className="p-6 bg-[#f0f4fd]/50 flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-bold text-[#004275] uppercase tracking-widest mb-1 block">
                      Verification Receipt
                    </span>
                    <h2
                      className="font-bold text-xl text-[#171c22] leading-tight"
                      style={{ fontFamily: "Public Sans, sans-serif" }}
                    >
                      {selected.name}
                    </h2>
                    <p className="text-xs text-[#414750] font-mono">ID: VRF-{selected.id}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="p-2 hover:bg-white rounded-lg transition-colors text-[#414750]"
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                  <div className="relative aspect-[3/4] bg-[#d6dae3] rounded-lg flex items-center justify-center overflow-hidden border border-[#c1c7d2]/20 px-4 text-center">
                    <div className="z-10 bg-white/90 backdrop-blur px-4 py-2 rounded-lg shadow-sm border border-white flex flex-col items-center gap-2">
                      <span className="material-symbols-outlined text-[#004275]">description</span>
                      <span className="text-xs font-bold text-[#171c22]">
                        OCR Result ID: {selected.raw.ocr_result_id || "-"}
                      </span>
                      <span className="text-[11px] text-[#414750]">
                        Document ID: {selected.raw.document_id || "-"}
                      </span>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-bold text-[#171c22] uppercase tracking-widest mb-4 flex items-center gap-2">
                      <span className="w-1 h-3 bg-[#006970] rounded-full" />
                      Validation Summary
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-sm bg-[#f0f4fd] p-3 rounded-lg">
                        <span className="text-[#414750]">Trust Score</span>
                        <span className="font-bold text-[#006970] text-base">{selected.confidence}%</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-[#f0f4fd] p-3 rounded-lg">
                          <p className="text-[10px] uppercase tracking-widest text-[#414750] font-bold mb-1">
                            OCR Status
                          </p>
                          <p className="text-sm font-semibold text-[#006970] flex items-center gap-1">
                            <span
                              className="material-symbols-outlined text-sm"
                              style={{ fontVariationSettings: "'FILL' 1" }}
                            >
                              {selected.raw.format_valid ? "check_circle" : "warning"}
                            </span>
                            {selected.raw.status === "verified" ? "Verified" : "Needs Review"}
                          </p>
                        </div>
                        <div className="bg-[#f0f4fd] p-3 rounded-lg">
                          <p className="text-[10px] uppercase tracking-widest text-[#414750] font-bold mb-1">
                            Authenticity
                          </p>
                          <p className="text-sm font-semibold text-[#006970] flex items-center gap-1">
                            <span
                              className="material-symbols-outlined text-sm"
                              style={{ fontVariationSettings: "'FILL' 1" }}
                            >
                              verified_user
                            </span>
                            {selected.raw.status === "verified" ? "VERIFIED" : "NEEDS REVIEW"}
                          </p>
                        </div>
                      </div>
                      <div className="bg-[#f0f4fd] p-3 rounded-lg">
                        <p className="text-[10px] uppercase tracking-widest text-[#414750] font-bold mb-1">
                          Notes
                        </p>
                        <p className="text-sm text-[#171c22]">
                          {selected.raw.analysis_summary || "No additional analysis notes."}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-bold text-[#171c22] uppercase tracking-widest mb-4 flex items-center gap-2">
                      <span className="w-1 h-3 bg-[#004275] rounded-full" />
                      Structured Extraction Results
                    </h3>
                    <div className="space-y-3">
                      {editableFieldConfig.map(({ label, key }) => (
                        <div key={key} className="space-y-1">
                          <label className="text-[10px] font-bold text-[#414750] uppercase tracking-widest">
                            {label}
                          </label>
                          <input
                            className="w-full bg-[#f0f4fd] border-none border-b border-[#c1c7d2]/30 focus:border-[#004275] focus:ring-0 text-sm font-medium py-2"
                            type="text"
                            value={editValues[key] || ""}
                            onChange={(event) => onEditFieldUpdate(key, event.target.value)}
                          />
                        </div>
                      ))}

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-[#414750] uppercase tracking-widest">
                          Composition
                        </label>
                        <textarea
                          className="w-full bg-[#f0f4fd] border-none border-b border-[#c1c7d2]/30 focus:border-[#004275] focus:ring-0 text-sm font-medium py-2 resize-none"
                          rows={2}
                          value={editValues.composition_summary || ""}
                          onChange={(event) =>
                            onEditFieldUpdate("composition_summary", event.target.value)
                          }
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-[#414750] uppercase tracking-widest">
                          Storage Instructions
                        </label>
                        <input
                          className="w-full bg-[#f0f4fd] border-none border-b border-[#c1c7d2]/30 focus:border-[#004275] focus:ring-0 text-sm font-medium py-2"
                          type="text"
                          value={editValues.storage_conditions || ""}
                          onChange={(event) =>
                            onEditFieldUpdate("storage_conditions", event.target.value)
                          }
                        />
                      </div>

                      <button
                        type="button"
                        onClick={onSaveStructuredEdits}
                        disabled={isSavingEdits}
                        className="w-full py-3 text-white rounded-lg text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                        style={{ background: "linear-gradient(135deg, #004275 0%, #005a9c 100%)" }}
                      >
                        {isSavingEdits ? "Saving..." : "Save Structured Results"}
                      </button>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-bold text-[#171c22] uppercase tracking-widest mb-4 flex items-center gap-2">
                      <span className="w-1 h-3 bg-[#004275] rounded-full" />
                      Audit Trail
                    </h3>
                    <div className="space-y-4 relative before:content-[''] before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-px before:bg-[#c1c7d2]/30">
                      {[
                        {
                          icon: "history_edu",
                          filled: true,
                          bg: "bg-[#d2e4ff]",
                          color: "text-[#004275]",
                          title: "Validation Finalized",
                          time: selected.dateTime,
                          extra: (
                            <p className="text-[10px] font-mono mt-1 text-[#414750] bg-[#f0f4fd] p-2 rounded">
                              Validation ID: {selected.id}
                            </p>
                          ),
                        },
                        {
                          icon: "clinical_notes",
                          filled: false,
                          bg: "bg-[#dee3eb]",
                          color: "text-[#414750]",
                          title: "OCR Extraction Linked",
                          time: `OCR Result ID: ${selected.raw.ocr_result_id || "-"}`,
                        },
                        {
                          icon: "assignment_late",
                          filled: false,
                          bg: "bg-[#dee3eb]",
                          color: "text-[#414750]",
                          title: "Missing Field Review",
                          time:
                            normalizeMissingFields(selected.raw.missing_fields).length > 0
                              ? normalizeMissingFields(selected.raw.missing_fields).join(", ")
                              : "No missing fields",
                        },
                      ].map((item, index) => (
                        <div key={`${item.title}-${index}`} className="flex gap-4 relative">
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
                            <p className="text-xs font-bold text-[#171c22] leading-none mb-1">{item.title}</p>
                            <p className="text-[10px] text-[#414750]">{item.time}</p>
                            {item.extra}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="p-6 border-t border-[#c1c7d2]/10 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={onExportValidationResults}
                    disabled={isExporting}
                    className="flex items-center justify-center gap-2 py-3 border border-[#c1c7d2]/30 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-[#f0f4fd] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <span className="material-symbols-outlined text-sm">print</span>
                    {isExporting ? "Exporting..." : "Export"}
                  </button>

                  <button
                    type="button"
                    onClick={onShareSummary}
                    className="flex items-center justify-center gap-2 py-3 text-white rounded-lg text-xs font-bold uppercase tracking-widest transition-all"
                    style={{ background: "linear-gradient(135deg, #004275 0%, #005a9c 100%)" }}
                  >
                    <span className="material-symbols-outlined text-sm">share</span>
                    Share
                  </button>

                  {selected?.raw?.status === "verified" && (
                    <button
                      type="button"
                      onClick={() => handleCompare(selected)}
                      className="col-span-2 flex items-center justify-center gap-2 py-3 text-white rounded-lg text-xs font-bold uppercase tracking-widest transition-all"
                      style={{ background: "linear-gradient(135deg, #006970 0%, #0097a7 100%)" }}
                    >
                      <span className="material-symbols-outlined text-sm">compare</span>
                      Compare with Verified Label
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}