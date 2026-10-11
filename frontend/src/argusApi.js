const API_BASE_URL = "http://localhost:8000";

async function request(path, { method = "GET", token, body } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
    },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = Array.isArray(data.detail)
      ? data.detail.map((item) => item.msg).join(" ")
      : data.detail;
    throw new Error(detail || `Request failed: ${response.status}`);
  }
  return data;
}

export async function scanQR(file, merchantName, location = {}) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("merchant_name", merchantName);
  formData.append("location_status", location.status || "unavailable");
  if (location.position) {
    formData.append("latitude", String(location.position.latitude));
    formData.append("longitude", String(location.position.longitude));
    formData.append("accuracy_m", String(location.position.accuracy));
  }
  return request("/api/scan", { method: "POST", body: formData });
}

export const registerMerchant = (body) => request("/api/merchant/register", { method: "POST", body });
export const loginMerchant = (body) => request("/api/merchant/login", { method: "POST", body });
export const getMerchant = (token) => request("/api/merchant/me", { token });
export const updateMerchant = (token, body) => request("/api/merchant/me", { method: "PUT", token, body });
export const logoutMerchant = (token) => request("/api/merchant/logout", { method: "POST", token });

async function adminRequest(path, token, method = "GET") {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { Authorization: `Admin ${token}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `Request failed: ${response.status}`);
  return data;
}

export const getPendingMerchants = (token) => adminRequest("/api/merchant/operator/pending", token);
export const setMerchantVerified = (token, merchantId, verified) =>
  adminRequest(`/api/merchant/operator/verify-upi/${merchantId}?verified=${verified}`, token, "POST");
