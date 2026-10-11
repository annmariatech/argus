import { useEffect, useState } from "react";
import { getMerchant, loginMerchant, logoutMerchant, registerMerchant, updateMerchant } from "./argusApi";
import "./MerchantMode.css";

const blankProfile = { shop_name: "", upi_id: "", latitude: "", longitude: "", radius_m: "150" };

function MerchantMode({ onBack }) {
  const [token, setToken] = useState("");
  const [profile, setProfile] = useState(blankProfile);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [registering, setRegistering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    getMerchant(token)
      .then(({ merchant }) => setProfile({ ...merchant, radius_m: String(merchant.radius_m) }))
      .catch(() => setToken(""));
  }, [token]);

  function change(key, value) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function useShopLocation() {
    setError("");
    if (!navigator.geolocation) {
      setError("Location is unavailable in this browser. Enter the shop coordinates manually.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setProfile((current) => ({
        ...current,
        latitude: String(coords.latitude),
        longitude: String(coords.longitude),
      })),
      () => setError("Could not access location. Check permission or enter coordinates manually."),
      { enableHighAccuracy: false, timeout: 30000, maximumAge: 60000 },
    );
  }

  async function submitAccount(event) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    const fields = {
      shop_name: profile.shop_name,
      upi_id: profile.upi_id,
      latitude: Number(profile.latitude),
      longitude: Number(profile.longitude),
      radius_m: Number(profile.radius_m),
    };
    try {
      if (registering) {
        const result = await registerMerchant({ ...fields, email, password });
        setMessage(result.message);
        setRegistering(false);
      } else {
        const result = await loginMerchant({ email, password });
        setToken(result.access_token);
        setProfile({ ...result.merchant, radius_m: String(result.merchant.radius_m) });
        setMessage("Signed in. Your profile is ready to manage.");
      }
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function saveProfile(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const { merchant } = await updateMerchant(token, {
        shop_name: profile.shop_name,
        upi_id: profile.upi_id,
        latitude: Number(profile.latitude),
        longitude: Number(profile.longitude),
        radius_m: Number(profile.radius_m),
      });
      setProfile({ ...merchant, radius_m: String(merchant.radius_m) });
      setMessage("Merchant details updated.");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function signOut() {
    try { await logoutMerchant(token); } catch { /* local session is cleared either way */ }
    setToken(""); setPassword(""); setProfile(blankProfile); setMessage("Signed out.");
  }

  return (
    <section className="merchant-mode stage-enter" aria-labelledby="merchant-mode-title">
      <div className="merchant-heading">
        <div>
          <div className="section-kicker">MERCHANT MODE</div>
          <h2 id="merchant-mode-title">{token ? "Manage your shop" : "Register your shop"}</h2>
          <p>Create an account to add or update the UPI ID and location used in QR checks.</p>
        </div>
        <button className="secondary-button" type="button" onClick={onBack}>← Back to scan</button>
      </div>

      <form className="merchant-card" onSubmit={token ? saveProfile : submitAccount}>
        {!token && (
          <div className="merchant-auth-switch">
            <button type="button" className={!registering ? "selected" : ""} onClick={() => setRegistering(false)}>Sign in</button>
            <button type="button" className={registering ? "selected" : ""} onClick={() => setRegistering(true)}>Create account</button>
          </div>
        )}
        {!token && <>
          <div className="merchant-form-grid">
            <label>Email address<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
            <label>Password<input type="password" minLength={10} autoComplete={registering ? "new-password" : "current-password"} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder={registering ? "At least 10 characters" : "Your password"} /></label>
          </div>
          {registering && <MerchantFields profile={profile} change={change} useShopLocation={useShopLocation} />}
          {error && <div className="error-message" role="alert">{error}</div>}
          {message && <p className="merchant-message" role="status">{message}</p>}
          <button className="verify-button" type="submit" disabled={busy}>{busy ? "Please wait…" : registering ? "Register merchant" : "Sign in"} <span aria-hidden="true">→</span></button>
          {registering && <p className="merchant-disclaimer">Registration stores a claimed UPI ID. The profile stays pending until an authorized operator independently verifies it.</p>}
        </>}
        {token && <>
          <MerchantFields profile={profile} change={change} useShopLocation={useShopLocation} />
          <div className="merchant-status">UPI verification: <strong>{profile.upi_verification_status === "verified" ? "Verified by Argus operator" : "Pending independent verification"}</strong></div>
          {error && <div className="error-message" role="alert">{error}</div>}
          {message && <p className="merchant-message" role="status">{message}</p>}
          <div className="merchant-actions"><button className="verify-button" type="submit" disabled={busy}>{busy ? "Saving…" : "Save shop details"} <span aria-hidden="true">→</span></button><button className="text-button" type="button" onClick={signOut}>Sign out</button></div>
        </>}
      </form>
    </section>
  );
}

function MerchantFields({ profile, change, useShopLocation }) {
  return <>
    <div className="merchant-form-grid">
      <label>Shop name<input required minLength={2} maxLength={120} value={profile.shop_name} onChange={(event) => change("shop_name", event.target.value)} placeholder="Green Mart" /></label>
      <label>UPI ID for verification<input required value={profile.upi_id} onChange={(event) => change("upi_id", event.target.value)} placeholder="shop@bank" /></label>
      <label>Shop latitude<input required type="number" min={-90} max={90} step="any" value={profile.latitude} onChange={(event) => change("latitude", event.target.value)} placeholder="12.9716" /></label>
      <label>Shop longitude<input required type="number" min={-180} max={180} step="any" value={profile.longitude} onChange={(event) => change("longitude", event.target.value)} placeholder="77.5946" /></label>
      <label>Allowed radius (metres)<input required type="number" min={25} max={5000} value={profile.radius_m} onChange={(event) => change("radius_m", event.target.value)} /></label>
    </div>
    <button className="text-button merchant-location-button" type="button" onClick={useShopLocation}>Use this device&apos;s current location</button>
  </>;
}

export default MerchantMode;
