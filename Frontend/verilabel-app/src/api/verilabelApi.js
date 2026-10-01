const configuredBaseUrl =
  process.env.REACT_APP_API_BASE_URL || process.env.VITE_API_BASE_URL || "";
const API_BASE_URL = configuredBaseUrl.replace(/\/+$/, "");

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return null;
}

async function apiRequest(path, options = {}) {
  let response;
  try {
    // Use native fetch with credentials to bypass extension interference
    response = await window.fetch(`${API_BASE_URL}${path}`, {
      ...options,
      credentials: 'same-origin',
      mode: 'cors',
    });
  } catch (error) {
    console.error('Fetch error:', error);
    throw new Error(
      "Cannot reach backend API. Make sure the backend server is running for local development.",
    );
  }

  const payload = await parseResponse(response);

  if (!response.ok) {
    const message =
      (payload && (payload.error || payload.message)) ||
      `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

export async function uploadForOCR(file) {
  const formData = new FormData();
  formData.append("file", file);

  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const endpoint = isPdf ? "/api/ocr/pdf" : "/api/ocr/image";

  const payload = await apiRequest(endpoint, {
    method: "POST",
    body: formData,
  });

  if (!payload?.success || !payload?.data) {
    throw new Error("OCR response payload was incomplete.");
  }
  return payload.data;
}

export async function validateExtractedText({
  text,
  ocrResultId,
  documentId,
  followupQuestion = "",
}) {
  return apiRequest("/api/validation/validate-text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      ocr_result_id: ocrResultId,
      document_id: documentId,
      followup_question: followupQuestion,
    }),
  });
}

export async function createVerifiedControl(
  ocrResultId,
  controlName,
  status = "verified",
  verifiedText = "",
) {
  const payload = await apiRequest(`/api/verified/create/${ocrResultId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      control_name: controlName,
      status,
      verified_text: verifiedText,
    }),
  });

  if (!payload?.success || !payload?.data) {
    throw new Error("Verified control response payload was incomplete.");
  }
  return payload.data;
}

export async function updateValidationResult(validationResultId, fields) {
  const payload = await apiRequest(`/api/validation/${validationResultId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });

  if (!payload?.success || !payload?.data) {
    throw new Error("Validation update response payload was incomplete.");
  }
  return payload.data;
}

export async function getLatestValidationRecords(limit = 50) {
  const payload = await apiRequest(`/api/validation/latest?limit=${limit}`);

  if (!payload?.success || !Array.isArray(payload?.data)) {
    throw new Error("Validation records response payload was incomplete.");
  }
  return payload.data;
}

export async function exportValidationResults() {
  const payload = await apiRequest("/api/export/validation-results");
  if (!payload?.success) {
    throw new Error(payload?.error || "Failed to export validation results.");
  }
  return payload;
}

export function getApiBaseUrl() {
  return API_BASE_URL;
}

export async function fetchComparisonData(validationId, ocrResultId) {
  const query = ocrResultId ? `?ocr_result_id=${ocrResultId}` : "";
  const payload = await apiRequest(`/api/validation/compare/${validationId}${query}`);

  if (!payload?.success || !payload?.data) {
    throw new Error("Comparison data response was incomplete.");
  }
  return payload.data;
}

export async function runComparisonForVerifiedControl(controlId, file) {
  const formData = new FormData();
  formData.append("file", file);

  const payload = await apiRequest(`/api/comparison/run/${controlId}`, {
    method: "POST",
    body: formData,
  });

  if (!payload?.success) {
    throw new Error(payload?.error || "Comparison request failed.");
  }

  return payload;
}

export async function getComparisonResult(comparisonId) {
  const payload = await apiRequest(`/api/comparison/result/${comparisonId}`);

  if (!payload?.success || !payload?.data) {
    throw new Error("Comparison result response payload was incomplete.");
  }

  return payload.data;
}