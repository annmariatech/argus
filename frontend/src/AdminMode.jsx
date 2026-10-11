import { useState } from "react";
import { getPendingMerchants, setMerchantVerified } from "./argusApi";
import "./AdminMode.css";

function AdminMode({ onBack, t }) {
  const [token, setToken] = useState("");
  const [inputToken, setInputToken] = useState("");
  const [merchants, setMerchants] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadPending(event) {
    event?.preventDefault();
    const candidate = token || inputToken.trim();
    if (!candidate) return;
    setLoading(true); setError(""); setMessage("");
    try {
      const data = await getPendingMerchants(candidate);
      setToken(candidate);
      setMerchants(data.merchants);
    } catch (err) { setError(t(err.message)); }
    finally { setLoading(false); }
  }

  async function reviewMerchant(merchantId, verified) {
    setBusyId(merchantId); setError(""); setMessage("");
    try {
      await setMerchantVerified(token, merchantId, verified);
      setMerchants((current) => current.filter((merchant) => merchant.id !== merchantId));
      setMessage(verified ? t("UPI verification recorded.") : t("Merchant returned to pending review."));
    } catch (err) { setError(t(err.message)); }
    finally { setBusyId(null); }
  }

  function lockPage() {
    setToken(""); setInputToken(""); setMerchants([]); setMessage(""); setError("");
  }

  return (
    <section className="admin-page stage-enter" aria-labelledby="admin-page-title">
      <div className="admin-page-heading">
        <div>
          <div className="section-kicker">{t("ADMIN MODE")}</div>
          <h1 id="admin-page-title">{t("Merchant verification")}</h1>
          <p>{t("Review pending UPI claims and record the result of your independent verification.")}</p>
        </div>
        <button className="secondary-button" type="button" onClick={onBack}>{t("Back to scan")}</button>
      </div>

      {!token ? (
        <form className="admin-access-card" onSubmit={loadPending}>
          <label htmlFor="admin-token">{t("Operator access token")}</label>
          <p className="admin-token-help">{t("The admin token is configured by the site operator on the server.")}</p>
          <input
            id="admin-token"
            type="password"
            autoComplete="current-password"
            value={inputToken}
            onChange={(event) => setInputToken(event.target.value)}
            placeholder={t("Enter the operator token")}
            required
          />
          {error && <div className="error-message" role="alert">{error}</div>}
          <button className="verify-button" type="submit" disabled={loading}>
            {loading ? t("Please wait…") : t("Load pending merchants")} <span aria-hidden="true">→</span>
          </button>
        </form>
      ) : (
        <div className="admin-review-area">
          <div className="admin-toolbar">
            <span className="admin-session-status"><i aria-hidden="true" />{t("Operator session")}</span>
            <div>
              <button className="text-button" type="button" onClick={loadPending} disabled={loading}>{t("Refresh list")}</button>
            <button className="text-button" type="button" onClick={lockPage}>{t("Lock admin page")}</button>
            </div>
          </div>
          {error && <div className="error-message" role="alert">{error}</div>}
          {message && <p className="merchant-message" role="status">{message}</p>}
          {merchants.length === 0 ? (
            <div className="admin-empty-state">{t("No pending merchant profiles.")}</div>
          ) : (
            <div className="admin-merchant-list">
              {merchants.map((merchant) => (
                <article className="admin-merchant-card" key={merchant.id}>
                  <div className="admin-merchant-title">
                    <div><span className="admin-id">#{merchant.id}</span><h2>{merchant.shop_name}</h2></div>
                    <span className="pending-badge">{t("Pending independent verification")}</span>
                  </div>
                  <dl className="admin-merchant-details">
                    <div><dt>{t("Email address")}</dt><dd>{merchant.email}</dd></div>
                    <div><dt>{t("UPI ID")}</dt><dd>{merchant.upi_id}</dd></div>
                    <div><dt>{t("Registered location")}</dt><dd>{merchant.latitude.toFixed(5)}, {merchant.longitude.toFixed(5)}</dd></div>
                    <div><dt>{t("Allowed radius (metres)")}</dt><dd>{merchant.radius_m} m</dd></div>
                    <div><dt>{t("Last updated")}</dt><dd>{merchant.updated_at}</dd></div>
                  </dl>
                  <div className="admin-review-actions">
                    <button className="verify-button" type="button" disabled={busyId === merchant.id} onClick={() => reviewMerchant(merchant.id, true)}>
                      {busyId === merchant.id ? t("Saving…") : t("Verify UPI ownership")}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
          <p className="admin-review-notice">{t("UPI ownership should be marked verified only after an independent payment-provider check.")}</p>
        </div>
      )}
      <button className="admin-back-link" type="button" onClick={onBack}>{t("Back to scan")}</button>
    </section>
  );
}

export default AdminMode;
