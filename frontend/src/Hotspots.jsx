import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getHotspots, submitHotspotReport } from "./argusApi";
import "./Hotspots.css";

const DEFAULT_CENTER = [10.8505, 76.2711];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function markerIcon(color, count) {
  return L.divIcon({
    className: "hotspot-marker-wrap",
    html: `<span class="hotspot-marker hotspot-${color}">${count}</span>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  });
}

export default function Hotspots({ t, pendingReport }) {
  const mapNode = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef(null);
  const [data, setData] = useState({ hotspots: [], radius_m: 250 });
  const [pin, setPin] = useState(null);
  const [pinMode, setPinMode] = useState(false);
  const pinModeRef = useRef(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { pinModeRef.current = pinMode; }, [pinMode]);

  async function refresh() {
    try { setData(await getHotspots()); } catch (error) { setStatus(error.message); }
  }

  useEffect(() => {
    let cancelled = false;
    getHotspots().then((nextData) => { if (!cancelled) setData(nextData); })
      .catch((error) => { if (!cancelled) setStatus(error.message); });
    const timer = window.setInterval(refresh, 10000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!mapNode.current || mapRef.current) return undefined;
    const map = L.map(mapNode.current, { scrollWheelZoom: false }).setView(DEFAULT_CENTER, 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    const layer = L.layerGroup().addTo(map);
    map.on("click", (event) => {
      if (pinModeRef.current) setPin({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    });
    mapRef.current = map;
    layersRef.current = layer;
    window.setTimeout(() => map.invalidateSize(), 0);
    return () => { map.remove(); mapRef.current = null; layersRef.current = null; };
  }, []);

  useEffect(() => {
    const layer = layersRef.current;
    if (!layer) return;
    layer.clearLayers();
    data.hotspots.forEach((hotspot) => {
      const dates = hotspot.reports.map((report) => new Date(report.reported_at).toLocaleString());
      const riskDetails = hotspot.reports.map((report, index) =>
        `<li><b>${escapeHtml(t("Report"))} ${index + 1}</b> · ${escapeHtml(report.risk_score)}/100 · ${escapeHtml(report.merchant_name || t("Merchant unavailable"))}<br><small>${escapeHtml(dates[index])}</small>${report.reasons?.length ? `<br><small>${report.reasons.map(escapeHtml).join(", ")}</small>` : ""}</li>`,
      ).join("");
      const popup = `<strong>${escapeHtml(hotspot.count)} ${escapeHtml(t("unverified dangerous reports"))}</strong><p>${escapeHtml(t("Reports within"))} ${escapeHtml(data.radius_m)} m</p><ul>${riskDetails}</ul><small>${escapeHtml(t("Community reports are unverified. Count alone does not prove a scam."))}</small>`;
      L.marker([hotspot.latitude, hotspot.longitude], { icon: markerIcon(hotspot.color, hotspot.count) })
        .bindPopup(popup).addTo(layer);
    });
    if (pin) {
      L.marker([pin.latitude, pin.longitude], { icon: markerIcon("pin", "•") })
        .bindPopup(`${escapeHtml(t("Selected report location"))}<br>${pin.latitude.toFixed(5)}, ${pin.longitude.toFixed(5)}`).addTo(layer);
    }
  }, [data, pin, t]);

  async function useCurrentLocation() {
    setStatus("");
    if (!navigator.geolocation) { setStatus(t("Location is unavailable in this browser.")); return; }
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const position = { latitude: coords.latitude, longitude: coords.longitude };
      setPin(position);
      mapRef.current?.setView([position.latitude, position.longitude], 15);
      setPinMode(false);
    }, (error) => setStatus(error.code === error.PERMISSION_DENIED ? t("Location permission was denied.") : t("Could not determine your location. You can pin it manually.")), { enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 });
  }

  async function submitReport() {
    if (!pendingReport) { setStatus(t("Run a scan with a DANGER verdict before submitting a report.")); return; }
    if (!pin) { setStatus(t("Share your location or select a point on the map first.")); return; }
    setBusy(true); setStatus("");
    try {
      await submitHotspotReport({ ...pendingReport, ...pin });
      setPin(null); setPinMode(false); setStatus(t("Report added as unverified community information."));
      await refresh();
    } catch (error) { setStatus(error.message); }
    finally { setBusy(false); }
  }

  return (
    <section className="hotspots-page page-content">
      <div className="hotspots-heading">
        <span className="section-kicker">{t("COMMUNITY SIGNALS")}</span>
        <h1>{t("Scam Hotspot Map")}</h1>
        <p>{t("See locations reported with dangerous QR scans. Reports are unverified and do not establish that a location or QR is fraudulent.")}</p>
      </div>
      <div className="hotspot-legend" aria-label={t("Map legend")}>
        <span><i className="legend-dot hotspot-yellow" /> {t("1 report · Yellow")}</span>
        <span><i className="legend-dot hotspot-orange" /> {t("2–3 reports · Orange")}</span>
        <span><i className="legend-dot hotspot-red" /> {t("More than 3 · Red")}</span>
        <span>{t("Grouping radius")}: {data.radius_m} {t("m")}</span>
      </div>
      <div className="hotspot-map-frame"><div className="hotspot-map" ref={mapNode} aria-label={t("Interactive map of unverified dangerous QR reports")} /></div>
      <div className="hotspot-disclaimer">{t("All markers represent unverified user reports. A high report count alone does not prove a scam. Map tiles © OpenStreetMap contributors.")}</div>
      <section className="hotspot-report-card">
        <div><span className="section-kicker">{t("REPORT A DANGEROUS QR")}</span><h2>{t("Where did you find it?")}</h2><p>{pendingReport ? `${t("DANGER verdict")} · ${pendingReport.risk_score}/100 · ${pendingReport.merchant_name || t("Merchant unavailable")}` : t("Scan a QR and get a DANGER verdict to enable reporting.")}</p></div>
        <div className="hotspot-report-actions">
          <button className="secondary-button" type="button" onClick={useCurrentLocation}>{t("Share my current location")}</button>
          <button className={`secondary-button ${pinMode ? "pin-mode-active" : ""}`} type="button" onClick={() => { setPinMode(!pinMode); setStatus(t("Click the map to place a pin.")); }}>{pinMode ? t("Cancel map pin") : t("Pin location on map")}</button>
          <button className="verify-button" type="button" disabled={!pendingReport || !pin || busy} onClick={submitReport}>{busy ? t("Submitting…") : t("Submit unverified report")}</button>
        </div>
        {pin && <p className="selected-pin">{t("Selected report location")}: {pin.latitude.toFixed(5)}, {pin.longitude.toFixed(5)}</p>}
        {status && <p className="hotspot-status" role="status">{status}</p>}
      </section>
    </section>
  );
}
