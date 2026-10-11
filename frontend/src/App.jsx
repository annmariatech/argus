import { useEffect, useRef, useState } from "react";
import { scanQR } from "./argusApi";
import MerchantMode from "./MerchantMode";
import AdminMode from "./AdminMode";
import Hotspots from "./Hotspots";
import SupportChat from "./SupportChat";
import AssessmentResult from "./AssessmentResult";
import { makeTranslator } from "./i18n";
import "./App.css";
import "./VisualSystem.css";

const MAX_RECENT_SCANS = 5;

function App() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [merchant, setMerchant] = useState("");
  const [result, setResult] = useState(null);
  const [stage, setStage] = useState("scan");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [recentScans, setRecentScans] = useState([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeSection, setActiveSection] = useState(() => {
    const currentRoute = routeFromPath(window.location.pathname);
    return currentRoute === "merchant" || currentRoute === "admin" || currentRoute === "hotspots" ? currentRoute : "scan";
  });
  const [page, setPage] = useState(() => routeFromPath(window.location.pathname));
  const [language, setLanguage] = useState(() => window.localStorage.getItem("argus-language") || "en");
  const [location, setLocation] = useState({ status: "unavailable", position: null });
  const t = makeTranslator(language);

  const fileInput = useRef(null);
  const historyCounterRef = useRef(0);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const menuButtonRef = useRef(null);
  const drawerCloseRef = useRef(null);
  const scanSectionRef = useRef(null);
  const assessmentRef = useRef(null);
  const historySectionRef = useRef(null);

  useEffect(() => {
    const handlePopState = () => {
      const route = routeFromPath(window.location.pathname);
      setPage(route);
      setActiveSection(route === "home" ? "scan" : route);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = "argus | payment security";
  }, [language]);

  function navigate(path) {
    if (window.location.pathname !== path) window.history.pushState({}, "", path);
    setPage(routeFromPath(path));
    setDrawerOpen(false);
    if (path === "/") setActiveSection("scan");
    if (path === "/merchant") setActiveSection("merchant");
    if (path === "/admin") setActiveSection("admin");
    if (path === "/hotspots") setActiveSection("hotspots");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function changeLanguage(nextLanguage) {
    setLanguage(nextLanguage);
    window.localStorage.setItem("argus-language", nextLanguage);
  }

  function selectFile(selectedFile) {
    if (!selectedFile) return;

    if (!selectedFile.type.startsWith("image/")) {
      setError(t("Please select an image file."));
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError(t("Please choose an image smaller than 10 MB."));
      return;
    }

    setFile(selectedFile);
    setPreview(URL.createObjectURL(selectedFile));
    setResult(null);
    setStage("scan");
    setSelectedHistoryId(null);
    setActiveSection("scan");
    setError("");
  }

  async function startCamera() {
    setError("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        "Camera access is unavailable. Try HTTPS or localhost, or upload an image.",
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });

      streamRef.current = stream;
      setCameraOpen(true);
    } catch (err) {
      console.error("Camera access failed:", err);
      setError(
        "Unable to access the camera. Allow camera permission or upload an image instead.",
      );
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }

  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(console.error);
    }
  }, [cameraOpen]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (!preview) return undefined;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  useEffect(() => {
    if (!drawerOpen) return undefined;

    const trigger = menuButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerCloseRef.current?.focus();

    function handleDrawerKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        setDrawerOpen(false);
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = Array.from(
        document.querySelectorAll(
          ".sidebar a[href], .sidebar button:not([disabled])",
        ),
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleDrawerKeyDown);
    return () => {
      document.removeEventListener("keydown", handleDrawerKeyDown);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [drawerOpen]);

  function capturePhoto() {
    const video = videoRef.current;

    if (!video || !video.videoWidth || !video.videoHeight) {
      setError(t("Camera is not ready yet. Please try again."));
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError(t("Unable to capture the image. Please try again."));
          return;
        }

        const photo = new File([blob], "camera-capture.jpg", {
          type: "image/jpeg",
        });

        selectFile(photo);
        stopCamera();
      },
      "image/jpeg",
      0.92,
    );
  }

  async function verifyQR() {
    if (!file) {
      setError(t("Upload a QR image to get started."));
      return;
    }

    if (!merchant.trim()) {
      setError(t("Enter the merchant name displayed at the shop."));
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);
    setStage("scan");
    setSelectedHistoryId(null);

    try {
      const data = await scanQR(file, merchant.trim(), location);
      setResult(data);
      setStage("assessment");
      historyCounterRef.current += 1;

      const historyEntry = {
        id: `scan-${historyCounterRef.current}`,
        scannedAt: new Date().toISOString(),
        merchantName: merchant.trim(),
        result: data,
      };
      setRecentScans((scans) =>
        [historyEntry, ...scans].slice(0, MAX_RECENT_SCANS),
      );
      setSelectedHistoryId(historyEntry.id);
      setActiveSection("scan");
      window.setTimeout(() => {
        assessmentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 40);
    } catch (err) {
      console.error("QR scan failed:", err);
      setError(t(err.message || "Unable to scan the QR code."));
    } finally {
      setLoading(false);
    }
  }

  function resetScan() {
    stopCamera();
    setFile(null);
    setPreview("");
    setMerchant("");
    setResult(null);
    setStage("scan");
    setSelectedHistoryId(null);
    setActiveSection("scan");
    setError("");
    if (fileInput.current) fileInput.current.value = "";
  }

  function reviewPreviousScan(scan) {
    stopCamera();
    setFile(null);
    setPreview("");
    if (fileInput.current) fileInput.current.value = "";
    setMerchant(scan.merchantName);
    setResult(scan.result);
    setStage("assessment");
    setSelectedHistoryId(scan.id);
    setActiveSection("history");
    setError("");
    window.setTimeout(() => {
      assessmentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
  }

  function openSection(section) {
    if (section === "merchant") return navigate("/merchant");
    if (section === "admin") return navigate("/admin");
    if (section === "hotspots") return navigate("/hotspots");
    if (section === "scan" || section === "history") {
      if (window.location.pathname !== "/") window.history.pushState({}, "", "/");
      setPage("home");
      setActiveSection(section);
      setDrawerOpen(false);
      if (section === "scan") setStage("scan");
    }
    window.setTimeout(() => {
      const target = section === "history" ? historySectionRef.current : scanSectionRef.current;
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 70);
  }

  function requestLocation() {
    setError("");
    if (!navigator.geolocation) {
      setLocation({ status: "unavailable", position: null });
      setError("Location is unavailable in this browser. You can still scan without a proximity check.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setLocation({
        status: "available",
        position: { latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy },
      }),
      (geoError) => {
        const denied = geoError.code === geoError.PERMISSION_DENIED;
        setLocation({ status: denied ? "denied" : "unavailable", position: null });
        const message = denied
          ? "The browser denied location access. Check macOS Location Services and this site's location permission, then try again."
          : geoError.code === geoError.TIMEOUT
            ? "The browser timed out while finding your location. Check your network and location services, then retry."
            : "The browser could not determine a location. Check macOS Location Services and this site's permission, then retry.";
        setError(`${t(message)}${geoError.code ? ` (${geoError.code})` : ""}`);
      },
      // Desktop Macs commonly determine location from Wi-Fi rather than GPS.
      // Do not require a high-accuracy GPS fix; the browser reports uncertainty
      // in coords.accuracy and the server accounts for it in the radius check.
      { enableHighAccuracy: false, timeout: 30000, maximumAge: 60000 },
    );
  }

  return (
    <div className="app-shell" lang={language}>
      <button
        className={`drawer-backdrop ${drawerOpen ? "is-visible" : ""}`}
        type="button"
        tabIndex={-1}
        aria-label={t("Close navigation menu")}
        aria-hidden={!drawerOpen}
        onClick={() => setDrawerOpen(false)}
      />

      <aside
        className={`sidebar ${drawerOpen ? "is-open" : ""}`}
        id="app-navigation"
        role="dialog"
        aria-modal={drawerOpen}
        aria-label={t("Main navigation")}
        aria-hidden={!drawerOpen}
        inert={!drawerOpen}
      >
        <div className="drawer-header">
          <a
            className="brand"
            href="/"
            onClick={(event) => { event.preventDefault(); navigate("/"); }}
            aria-label={t("Home")}
          >
            <img src="/argus-logo.png" alt={t("Argus official logo")} className="brand-logo" />
          </a>
          <button
            className="drawer-close"
            type="button"
            ref={drawerCloseRef}
            aria-label={t("Close navigation menu")}
            onClick={() => setDrawerOpen(false)}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div className="side-label">{t("Workspace")}</div>
        <nav className="navigation-links" aria-label={t("Workspace")}>
          <a
            className={`nav-item ${activeSection === "scan" ? "active" : ""}`}
            href="/"
            onClick={(event) => { event.preventDefault(); openSection("scan"); }}
          >
            <span aria-hidden="true">⌗</span> {t("QR Verification")}
          </a>
          <a
            className={`nav-item ${activeSection === "history" ? "active" : ""}`}
            href="/#scan-history"
            onClick={(event) => { event.preventDefault(); openSection("history"); }}
          >
            <span aria-hidden="true">◷</span> {t("Scan History")}
            {recentScans.length > 0 && (
              <span className="history-count">{recentScans.length}</span>
            )}
          </a>
          <a
            className={`nav-item ${activeSection === "merchant" ? "active" : ""}`}
            href="/merchant"
            onClick={(event) => { event.preventDefault(); openSection("merchant"); }}
          >
            <span aria-hidden="true">⌂</span> {t("Merchant Mode")}
          </a>
          <a
            className={`nav-item ${activeSection === "admin" ? "active" : ""}`}
            href="/admin"
            onClick={(event) => { event.preventDefault(); openSection("admin"); }}
          >
            <span aria-hidden="true">◇</span> {t("Admin Mode")}
          </a>
          <a
            className={`nav-item ${activeSection === "hotspots" ? "active" : ""}`}
            href="/hotspots"
            onClick={(event) => { event.preventDefault(); openSection("hotspots"); }}
          >
            <span aria-hidden="true">◎</span> {t("Scam Hotspot Map")}
          </a>
        </nav>

        <div className="sidebar-bottom">
          <span className="status-dot" aria-hidden="true" />
          <span>{t("Prototype environment")}</span>
        </div>
      </aside>

      <main className="main-content" id="top">
        <header className="topbar">
          <button
            ref={menuButtonRef}
            type="button"
            className="menu-trigger"
            aria-label={t("Open navigation menu")}
            aria-expanded={drawerOpen}
            aria-controls="app-navigation"
            onClick={() => setDrawerOpen(true)}
          >
            <span />
            <span />
            <span />
          </button>
          <div className="breadcrumb">
            <img src="/argus-logo.png" alt={t("Argus official logo")} className="breadcrumb-logo" />
            <span>/</span> {t(page === "merchant" ? "Merchant Mode" : page === "admin" ? "Admin Mode" : page === "hotspots" ? "Scam Hotspot Map" : "Payment Security")}
          </div>
          <div className="topbar-tag">
            <span aria-hidden="true" /> {t("QR Risk Workspace")}
          </div>
          <button className="language-toggle" type="button" onClick={() => changeLanguage(language === "en" ? "ml" : "en")} lang={language === "en" ? "ml" : "en"}>
            {language === "en" ? "മലയാളം" : "English"}
          </button>
        </header>
        {page === "merchant" && <MerchantMode onBack={() => navigate("/")} t={t} />}
        {page === "admin" && <AdminMode onBack={() => navigate("/")} t={t} />}
        {page === "hotspots" && <Hotspots t={t} pendingReport={result?.verdict === "DANGER" ? {
          verdict: result.verdict,
          risk_score: result.risk_score,
          merchant_name: result.merchant_name || merchant,
          payee_name: result.payee?.name || "",
          reasons: (result.reasons || []).map((reason) => reason.code),
        } : null} />}
        {page === "home" && <>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-grid" aria-hidden="true" />
          <div className="hero-glow hero-glow-one" aria-hidden="true" />
          <div className="hero-glow hero-glow-two" aria-hidden="true" />

          <div className="hero-copy">
            <div className="hero-brand-signature">
              <img src="/argus-logo.png" alt={t("Argus official logo")} className="signature-logo" />
            </div>
            <h1 id="hero-title">
              {t("Pause. Scan.")}<br />
              <span className="verify-word">{t("Verify.")}</span>
            </h1>
            <p>{t("Check who a UPI QR points to and inspect its visible edges for signs of tampering before you pay.")}</p>
            <a
              className="primary-cta"
              href="#scan-stage"
              onClick={(event) => { event.preventDefault(); openSection("scan"); }}
            >
              {t("Start a security check")} <span aria-hidden="true">↗</span>
            </a>
            <div className="hero-assurance">
              <span aria-hidden="true">⌁</span> {t("No payment or PIN required")}
            </div>
          </div>

          <div className="hero-art" aria-label={t("Payment safety assistant")}>
            <div className="hero-orbit orbit-one" aria-hidden="true" />
            <div className="hero-orbit orbit-two" aria-hidden="true" />
            <div className="hero-art-tag"><span /> {t("QR integrity monitor")}</div>
            <img
              src="/argus-mascot.png"
              alt={t("Yellow robot mascot")}
              className="hero-mascot"
            />
            <div className="hero-signal-card">
              <span className="signal-icon" aria-hidden="true">⌗</span>
              <span><strong>{t("Payee check")}</strong><small>{t("Before you authorize")}</small></span>
              <span className="signal-dot" aria-hidden="true" />
            </div>
          </div>

          <div className="hero-footnote">
            <span>01 — 03</span> · {t("A clearer moment before every payment")}
          </div>
        </section>

        <section className="how-section" aria-labelledby="how-title">
          <div className="section-kicker">{t("A simple checkpoint")}</div>
          <div className="how-heading-row">
            <h2 id="how-title">{t("How this check works")}</h2>
            <p>{t("Three quick checks. One explainable assessment.")}</p>
          </div>
          <div className="how-steps">
            <article className="how-step">
              <span className="step-number">01</span>
              <div className="step-icon" aria-hidden="true">⌗</div>
              <h3>{t("Scan the QR")}</h3>
              <p>{t("Upload a clear image or capture the payment QR with your camera.")}</p>
            </article>
            <article className="how-step">
              <span className="step-number">02</span>
              <div className="step-icon" aria-hidden="true">◎</div>
              <h3>{t("Check the signals")}</h3>
              <p>{t("Compare the payee with the shop name and inspect visible QR edges.")}</p>
            </article>
            <article className="how-step">
              <span className="step-number">03</span>
              <div className="step-icon" aria-hidden="true">↗</div>
              <h3>{t("Review the result")}</h3>
              <p>{t("Read the verdict and reasons before deciding what to do next.")}</p>
            </article>
          </div>
        </section>

        <section className="workflow" aria-label={t("QR security check workflow")}>
          <div className="workflow-heading">
            <div>
              <div className="section-kicker">{t("Security workspace")}</div>
              <h2>{t("Payment QR assessment")}</h2>
            </div>
            <div className="workflow-progress" aria-label={`${t("Current stage")}: ${stage === "scan" ? t("1 of 2, scan") : t("2 of 2, assessment")}`}>
              <span className={stage === "scan" ? "current" : "complete"}>01 <b>{t("Scan")}</b></span>
              <i aria-hidden="true" />
              <span className={stage === "assessment" ? "current" : ""}>02 <b>{t("Assessment")}</b></span>
            </div>
          </div>

          {stage === "scan" ? (
            <section className="scan-stage stage-enter" id="scan-stage" ref={scanSectionRef} aria-labelledby="scan-title">
              <div className="stage-intro">
                <span className="stage-index">{t("Step 01")}</span>
                <h3 id="scan-title">{t("Start with the payment QR")}</h3>
                <p>{t("Use a clear photo that includes the complete code and its printed border.")}</p>
              </div>

              <div className="scan-layout">
                <div className="scan-form-card">
                  <input
                    ref={fileInput}
                    className="hidden-input"
                    type="file"
                    accept="image/*"
                    onChange={(event) => selectFile(event.target.files[0])}
                    aria-label={t("Choose a payment QR image")}
                  />

                  <div className="camera-controls">
                    {!cameraOpen ? (
                      <button type="button" className="camera-button" onClick={startCamera}>
                        <span aria-hidden="true">◉</span> {t("Scan with camera")}
                      </button>
                    ) : (
                      <div className="camera-view">
                        <video ref={videoRef} autoPlay playsInline muted aria-label={t("Live camera preview of QR code")} />
                        <p>{t("Position the complete QR code inside the frame.")}</p>
                        <div className="camera-actions">
                          <button type="button" className="camera-button" onClick={capturePhoto}>{t("Capture photo")}</button>
                          <button type="button" className="text-button" onClick={stopCamera}>{t("Close camera")}</button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div
                    className={`upload-area ${dragging ? "dragging" : ""} ${preview ? "has-preview" : ""}`}
                    onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDragging(false);
                      selectFile(event.dataTransfer.files[0]);
                    }}
                  >
                    {preview ? (
                      <div className="preview-content">
                        <img src={preview} alt={t("Selected QR image preview")} />
                        <div className="preview-file-details">
                          <strong>{file.name}</strong>
                          <span>{(file.size / 1024).toFixed(1)} KB · {t("Ready to inspect")}</span>
                        </div>
                        <button className="text-button" type="button" onClick={resetScan}>{t("Remove image")}</button>
                      </div>
                    ) : (
                      <>
                        <div className="upload-icon" aria-hidden="true">
                          <svg viewBox="0 0 48 48" fill="none">
                            <path d="M24 31V8m0 0L15 17m9-9 9 9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M9 29v9a2 2 0 0 0 2 2h26a2 2 0 0 0 2-2v-9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                          </svg>
                        </div>
                        <h4>{t("Drop your QR image here")}</h4>
                        <p>{t("or browse files from your device")}</p>
                        <button className="browse-button" type="button" onClick={() => fileInput.current?.click()}>
                          {t("Browse files")} <span aria-hidden="true">↗</span>
                        </button>
                        <span className="file-hint">{t("PNG, JPG or WEBP · Max 10 MB")}</span>
                      </>
                    )}
                  </div>

                  <div className="field-group">
                    <label htmlFor="merchant">{t("Merchant name").toUpperCase()}</label>
                    <input
                      id="merchant"
                      type="text"
                      placeholder={t("e.g. Cafe Mocha, Campus Store...")}
                      value={merchant}
                      onChange={(event) => {
                        setMerchant(event.target.value);
                        setResult(null);
                        setStage("scan");
                        setSelectedHistoryId(null);
                        setError("");
                      }}
                    />
                    <span className="field-hint">{t("Enter the shop name shown on the physical QR stand.")}</span>
                  </div>

                  <div className="field-group location-permission-group">
                    <label>{t("Shop proximity check").toUpperCase()}</label>
                    <button className="secondary-button location-button" type="button" onClick={requestLocation}>
                      {location.status === "available" ? t("Refresh my location") : t("Allow location for this scan")}
                    </button>
                    <span className="field-hint">
                      {location.position
                        ? t(`Location ready · GPS accuracy ±${Math.round(location.position.accuracy)} m`)
                        : location.status === "denied"
                          ? t("Permission denied · proximity cannot be checked")
                          : t("Optional · your browser will ask before sharing device coordinates")}
                    </span>
                  </div>

          {error && <div className="error-message" role="alert">{t(error)}</div>}

                  <button className="verify-button" type="button" onClick={verifyQR} disabled={loading}>
                    {loading ? <><span className="loading-spinner" aria-hidden="true" /> {t("Checking QR signals…")}</> : <>{t("Verify payment QR")} <span aria-hidden="true">→</span></>}
                  </button>
                  <div className="privacy-note"><span aria-hidden="true">◇</span> {t("Don't enter your UPI PIN or banking credentials.")}</div>
                </div>

                <aside className="scan-side-note">
                  <div className="note-icon" aria-hidden="true">!</div>
                  <div className="note-title">{t("A quick safety reminder")}</div>
                  <p>{t("This tool checks visible QR and payee signals. It does not authenticate the recipient or guarantee payment safety.")}</p>
                  <div className="note-divider" />
                  <div className="note-check"><span>01</span> {t("Compare the name printed at the shop")}</div>
                  <div className="note-check"><span>02</span> {t("Confirm the payee again in your UPI app")}</div>
                </aside>
              </div>
            </section>
          ) : (
            <section className="assessment-stage stage-enter" id="assessment-stage" ref={assessmentRef} aria-labelledby="assessment-title">
              <AssessmentResult result={result} merchantName={merchant} t={t}
                onNewScan={resetScan} onHistory={() => openSection("history")}
                onReport={() => navigate("/hotspots")} />
            </section>
          )}
        </section>

        <section className="history-section" id="scan-history" ref={historySectionRef} aria-labelledby="scan-history-title">
          <div className="history-heading">
            <div>
              <div className="section-kicker">{t("This session")}</div>
              <h2 id="scan-history-title">{t("Recent scan history")}</h2>
            </div>
            <span className="history-total">{recentScans.length} / {MAX_RECENT_SCANS}</span>
          </div>

          {recentScans.length === 0 ? (
            <p className="history-empty">{t("Completed scans will appear here until you close or refresh this page.")}</p>
          ) : (
            <div className="history-list">
              {recentScans.map((scan) => {
                const verdict = scan.result.verdict?.toLowerCase() || "unknown";
                return (
                  <button
                    className={`history-entry ${selectedHistoryId === scan.id ? "selected" : ""}`}
                    key={scan.id}
                    type="button"
                    aria-pressed={selectedHistoryId === scan.id}
                    onClick={() => reviewPreviousScan(scan)}
                  >
                    <span className={`history-verdict verdict-${verdict}`}>{t(scan.result.verdict || "UNKNOWN")}</span>
                    <span className="history-details">
                      <strong>{scan.merchantName || t("Merchant unavailable")}</strong>
                      <span>{t("Payee: ")}{scan.result.payee?.name || t("Unavailable")}{scan.result.payee?.vpa ? ` · ${scan.result.payee.vpa}` : ""}</span>
                      <time dateTime={scan.scannedAt}>{new Date(scan.scannedAt).toLocaleString(language === "ml" ? "ml-IN" : "en-IN")}</time>
                    </span>
                    <span className="history-score">{scan.result.risk_score ?? "—"}<small> / 100</small></span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
        </>}

        <footer className="page-footer">
          <img src="/argus-logo.png" alt={t("Argus official logo")} className="footer-logo" />
          <span>{t("Built for safer digital payments · Hackathon prototype")}</span>
        </footer>
        <SupportChat t={t} />
      </main>
    </div>
  );
}

function routeFromPath(path) {
  if (path === "/merchant") return "merchant";
  if (path === "/admin") return "admin";
  if (path === "/hotspots") return "hotspots";
  return "home";
}

export default App;
