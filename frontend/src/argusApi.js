const API_BASE_URL = "http://localhost:8000";

export async function scanQR(file, merchantName) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("merchant_name", merchantName);

  const response = await fetch(`${API_BASE_URL}/api/scan`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || `Scan failed: ${response.status}`);
  }

  return response.json();
}