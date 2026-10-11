import "./AssessmentResult.css";

const PAYEE_CODES = new Set(["NAME_MATCH", "NAME_PARTIAL_MATCH", "NAME_MISMATCH", "PAYEE_NAME_MISSING", "MERCHANT_NAME_MISSING", "VPA_MISSING"]);
const VISUAL_CODES = new Set(["TAMPER_UNAVAILABLE", "TAMPER_HIGH", "TAMPER_POSSIBLE", "TAMPER_LOW", "TAMPER_DETAIL"]);

function EvidenceGroup({ index, label, status, tone, summary, reasons, rows, t }) {
  const detailsAvailable = reasons.length > 0 || rows.length > 0;
  return <article className={`evidence-group tone-${tone}`}>
    <div className="evidence-head"><div><span>{index}</span><h3>{label}</h3></div><strong>{status}</strong></div>
    <p>{summary}</p>
    {detailsAvailable && <details>
      <summary>{t("View evidence details")}</summary>
      {rows.length > 0 && <dl>{rows.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>}
      {reasons.length > 0 && <ul>{reasons.map((reason, i) => <li key={`${reason.code}-${i}`}><b>{t(reason.code.replaceAll("_", " "))}</b><span>{t(reason.message)}</span></li>)}</ul>}
    </details>}
  </article>;
}

function coordinates(location) {
  return `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;
}

export default function AssessmentResult({ result, merchantName, t, onNewScan, onHistory, onReport }) {
  const reasons = result.reasons || [];
  const payeeReasons = reasons.filter((reason) => PAYEE_CODES.has(reason.code));
  const visualReasons = reasons.filter((reason) => VISUAL_CODES.has(reason.code));
  const availabilityReasons = reasons.filter((reason) => !PAYEE_CODES.has(reason.code) && !VISUAL_CODES.has(reason.code));
  const nameReason = reasons.find((reason) => ["NAME_MATCH", "NAME_PARTIAL_MATCH", "NAME_MISMATCH", "PAYEE_NAME_MISSING", "MERCHANT_NAME_MISSING"].includes(reason.code));
  const tamperReason = reasons.find((reason) => ["TAMPER_UNAVAILABLE", "TAMPER_HIGH", "TAMPER_POSSIBLE", "TAMPER_LOW"].includes(reason.code));
  const location = result.location_verification;
  const scoreValue = result.risk_score;
  const score = scoreValue !== null && scoreValue !== undefined && Number.isFinite(Number(scoreValue)) ? Number(scoreValue) : null;
  const verdict = (result.verdict || "UNKNOWN").toLowerCase();
  const merchant = result.merchant_name || merchantName || t("Unavailable");
  const payee = result.payee?.name || t("Unavailable");
  const vpa = result.payee?.vpa || location?.detected_upi_id || t("Unavailable");
  const nameTone = nameReason?.code === "NAME_MATCH" ? "good" : nameReason?.code === "NAME_MISMATCH" ? "risk" : nameReason?.code === "NAME_PARTIAL_MATCH" ? "caution" : "neutral";
  const nameStatus = nameReason?.code === "NAME_MATCH" ? t("Names match") : nameReason?.code === "NAME_MISMATCH" ? t("Name mismatch") : nameReason?.code === "NAME_PARTIAL_MATCH" ? t("Partial match") : t("Unavailable");
  const tamperTone = !tamperReason || tamperReason.code === "TAMPER_LOW" ? "good" : tamperReason.code === "TAMPER_UNAVAILABLE" ? "neutral" : tamperReason.code === "TAMPER_HIGH" ? "risk" : "caution";
  const tamperStatus = !tamperReason ? t("Unavailable") : tamperReason.code === "TAMPER_UNAVAILABLE" ? t("Not checked") : tamperReason.code === "TAMPER_LOW" ? t("Few signals") : tamperReason.code === "TAMPER_HIGH" ? t("Strong signals observed") : t("Possible signals observed");
  const locationStatus = location?.status;
  const locationLabel = locationStatus === "LOCATION_MATCH" ? t("Within registered radius") : locationStatus === "LOCATION_MISMATCH" ? t("Outside registered radius") : locationStatus === "LOCATION_UNCERTAIN" ? t("Location uncertain") : locationStatus === "UPI_NOT_VERIFIED" ? t("UPI not verified") : locationStatus === "UNKNOWN_MERCHANT" ? t("No registered merchant") : t("Not checked");
  const locationTone = locationStatus === "LOCATION_MATCH" ? "good" : locationStatus === "LOCATION_MISMATCH" ? "risk" : ["LOCATION_UNCERTAIN", "UPI_NOT_VERIFIED"].includes(locationStatus) ? "caution" : "neutral";
  const locationRows = [];
  if (location?.current_location) locationRows.push([t("Current location"), coordinates(location.current_location)]);
  if (location?.registered_location) locationRows.push([t("Registered location"), coordinates(location.registered_location)]);
  if (location?.distance_m != null && location?.radius_m != null) locationRows.push([t("Distance / radius"), `${location.distance_m} ${t("m")} / ${location.radius_m} ${t("m")}`]);
  if (location?.accuracy_m != null) locationRows.push([t("GPS accuracy"), `±${Math.round(location.accuracy_m)} ${t("m")}`]);
  const summary = verdict === "safe" ? t("No major risk signals were returned for this scan.") : verdict === "suspicious" ? t("One or more checks need a closer look before you pay.") : verdict === "danger" ? t("The scan returned high-risk signals. Pause and verify the payee independently.") : t("Review the available scan evidence.");

  return <div className="assessment-report stage-enter">
    <header className={`report-verdict verdict-${verdict}`}>
      <div className="report-verdict-copy">
        <span className="report-kicker">{t("QR SECURITY ASSESSMENT")}</span>
        <h2 id="assessment-title">{t(result.verdict || "UNKNOWN")}</h2>
        <p>{summary}</p>
      </div>
      <div className="risk-display" aria-label={score == null ? t("Risk score unavailable") : `${t("Risk score")}: ${score} / 100`}>
        <strong>{score ?? "—"}<small>/100</small></strong><span>{t("RISK SCORE")}</span>
      </div>
      <div className="risk-scale" role="img" aria-label={score == null ? t("Risk score unavailable") : `${t("Risk score")} ${score} ${t("out of 100")} `}>
        <div className="risk-track"><span style={{ width: `${score ?? 0}%` }} /><i style={{ left: `${score ?? 0}%` }} /></div>
        <div className="risk-labels"><span>0</span><span>100</span></div>
      </div>
      <p className="report-disclaimer">{t(result.disclaimer || "This assessment cannot guarantee payment safety.")}</p>
    </header>

    <section className="report-comparison" aria-labelledby="comparison-title">
      <div className="report-section-heading"><span>01</span><h3 id="comparison-title">{t("Merchant and payee")}</h3></div>
      <div className="comparison-flow">
        <div><span>{t("Shop display name")}</span><strong>{merchant}</strong></div>
        <div className={`comparison-link link-${nameTone}`}><i /><span>{nameStatus}</span><i /></div>
        <div><span>{t("QR payee name")}</span><strong>{payee}</strong></div>
      </div>
      <div className="comparison-upi"><span>{t("UPI ID extracted from QR")}</span><strong>{vpa}</strong></div>
      <p className="comparison-caveat">{t("A name match is only a comparison signal; it does not authenticate the payment account.")}</p>
    </section>

    <section className="report-evidence" aria-labelledby="evidence-title">
      <div className="report-section-heading"><span>02</span><h3 id="evidence-title">{t("What Argus checked")}</h3></div>
      <div className="evidence-list">
        <EvidenceGroup index="A" label={t("Payee verification")} status={nameStatus} tone={nameTone}
          summary={nameReason ? t(nameReason.message) : t("The name comparison was unavailable for this scan.")} reasons={payeeReasons} rows={[]} t={t} />
        <EvidenceGroup index="B" label={t("Visual tamper analysis")} status={tamperStatus} tone={tamperTone}
          summary={tamperReason ? `${t(tamperReason.message)} ${t("Observed image signals are not proof of fraud.")}` : t("No tamper-analysis result was returned.")} reasons={visualReasons} rows={[]} t={t} />
        <EvidenceGroup index="C" label={t("Availability and limitations")} status={locationLabel} tone={locationTone}
          summary={t(location?.message || location?.location_message || "Location verification was unavailable.")} reasons={availabilityReasons} rows={locationRows} t={t} />
      </div>
    </section>
    <footer className="report-actions">
      <button className="verify-button" type="button" onClick={onNewScan}>{t("Start a new scan")} <span aria-hidden="true">→</span></button>
      <button type="button" onClick={onHistory}>{t("Review scan history")}</button>
      {result.verdict === "DANGER" && <button className="report-hotspot-action" type="button" onClick={onReport}>{t("Report location to hotspot map")}</button>}
    </footer>
  </div>;
}
