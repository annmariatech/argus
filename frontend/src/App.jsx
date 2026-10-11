import { useEffect, useRef, useState } from "react";
import { scanQR } from "./argusApi";
import "./App.css";

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
  const [activeSection, setActiveSection] = useState("scan");

  const fileInput = useRef(null);
  const historyCounterRef = useRef(0);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const menuButtonRef = useRef(null);
  const drawerCloseRef = useRef(null);
  const scanSectionRef = useRef(null);
  const assessmentRef = useRef(null);
  const historySectionRef = useRef(null);

  function selectFile(selectedFile) {
    if (!selectedFile) return;

    if (!selectedFile.type.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError("Please choose an image smaller than 10 MB.");
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
      setError("Camera is not ready yet. Please try again.");
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
          setError("Unable to capture the image. Please try again.");
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
      setError("Upload a QR image to get started.");
      return;
    }

    if (!merchant.trim()) {
      setError("Enter the merchant name displayed at the shop.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);
    setStage("scan");
    setSelectedHistoryId(null);

    try {
      const data = await scanQR(file, merchant.trim());
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
      setError(err.message || "Unable to scan the QR code.");
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
    setActiveSection(section);
    setDrawerOpen(false);
    if (section === "scan") setStage("scan");
    window.setTimeout(() => {
      const target = section === "history" ? historySectionRef.current : scanSectionRef.current;
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 70);
  }

  const verdictClass = result?.verdict ? result.verdict.toLowerCase() : "";

  return (
    <div className="app-shell">
      <button
        className={`drawer-backdrop ${drawerOpen ? "is-visible" : ""}`}
        type="button"
        tabIndex={-1}
        aria-label="Close navigation menu"
        aria-hidden={!drawerOpen}
        onClick={() => setDrawerOpen(false)}
      />

      <aside
        className={`sidebar ${drawerOpen ? "is-open" : ""}`}
        id="app-navigation"
        role="dialog"
        aria-modal={drawerOpen}
        aria-label="Main navigation"
        aria-hidden={!drawerOpen}
        inert={!drawerOpen}
      >
        <div className="drawer-header">
          <a
            className="brand"
            href="#top"
            onClick={() => {
              setDrawerOpen(false);
              setActiveSection("scan");
            }}
            aria-label="Argus home"
          >
            <span className="brand-icon">
              <img src="/argus-head.png" alt="" />
            </span>
            <img src="/argus-logo.png" alt="ARGUS" className="brand-logo" />
          </a>
          <button
            className="drawer-close"
            type="button"
            ref={drawerCloseRef}
            aria-label="Close navigation menu"
            onClick={() => setDrawerOpen(false)}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div className="side-label">WORKSPACE</div>
        <nav className="navigation-links" aria-label="Workspace sections">
          <a
            className={`nav-item ${activeSection === "scan" ? "active" : ""}`}
            href="#scan-stage"
            onClick={(event) => { event.preventDefault(); openSection("scan"); }}
          >
            <span aria-hidden="true">⌗</span> QR Verification
          </a>
          <a
            className={`nav-item ${activeSection === "history" ? "active" : ""}`}
            href="#scan-history"
            onClick={(event) => { event.preventDefault(); openSection("history"); }}
          >
            <span aria-hidden="true">◷</span> Scan History
            {recentScans.length > 0 && (
              <span className="history-count">{recentScans.length}</span>
            )}
          </a>
        </nav>

        <div className="sidebar-bottom">
          <span className="status-dot" aria-hidden="true" />
          <span>Prototype environment</span>
        </div>
      </aside>

      <main className="main-content" id="top">
        <header className="topbar">
          <button
            ref={menuButtonRef}
            type="button"
            className="menu-trigger"
            aria-label="Open navigation menu"
            aria-expanded={drawerOpen}
            aria-controls="app-navigation"
            onClick={() => setDrawerOpen(true)}
          >
            <span />
            <span />
            <span />
          </button>
          <div className="breadcrumb">
            ARGUS <span>/</span> PAYMENT SECURITY
          </div>
          <div className="topbar-tag">
            <span aria-hidden="true" /> QR RISK WORKSPACE
          </div>
        </header>

        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-grid" aria-hidden="true" />
          <div className="hero-glow hero-glow-one" aria-hidden="true" />
          <div className="hero-glow hero-glow-two" aria-hidden="true" />

          <div className="hero-copy">
            <div className="hero-brand-signature">
              <span className="signature-icon"><img src="/argus-head.png" alt="" /></span>
              <span className="signature-name">ARGUS<small>PAYMENT GUARDIAN</small></span>
            </div>
            <div className="eyebrow"><span /> YOUR PAYMENT SAFETY CHECK</div>
            <h1 id="hero-title">
              Pause. Scan.<br />
              <span className="verify-word">Verify.</span>
            </h1>
            <p>
              Check who a UPI QR points to and inspect its visible edges for
              signs of tampering before you pay.
            </p>
            <a
              className="primary-cta"
              href="#scan-stage"
              onClick={(event) => { event.preventDefault(); openSection("scan"); }}
            >
              Start a security check <span aria-hidden="true">↗</span>
            </a>
            <div className="hero-assurance">
              <span aria-hidden="true">⌁</span> No payment or PIN required
            </div>
          </div>

          <div className="hero-art" aria-label="Argus security assistant">
            <div className="hero-orbit orbit-one" aria-hidden="true" />
            <div className="hero-orbit orbit-two" aria-hidden="true" />
            <div className="hero-art-tag"><span /> QR INTEGRITY MONITOR</div>
            <img
              src="/argus-mascot.png"
              alt="Argus yellow robot mascot"
              className="hero-mascot"
            />
            <div className="hero-signal-card">
              <span className="signal-icon" aria-hidden="true">⌗</span>
              <span><strong>Payee check</strong><small>Before you authorize</small></span>
              <span className="signal-dot" aria-hidden="true" />
            </div>
          </div>

          <div className="hero-footnote">
            <span>01 — 03</span> A clearer moment before every payment
          </div>
        </section>

        <section className="how-section" aria-labelledby="how-title">
          <div className="section-kicker">A SIMPLE CHECKPOINT</div>
          <div className="how-heading-row">
            <h2 id="how-title">How Argus works</h2>
            <p>Three quick checks. One explainable assessment.</p>
          </div>
          <div className="how-steps">
            <article className="how-step">
              <span className="step-number">01</span>
              <div className="step-icon" aria-hidden="true">⌗</div>
              <h3>Scan the QR</h3>
              <p>Upload a clear image or capture the payment QR with your camera.</p>
            </article>
            <article className="how-step">
              <span className="step-number">02</span>
              <div className="step-icon" aria-hidden="true">◎</div>
              <h3>Check the signals</h3>
              <p>Compare the payee with the shop name and inspect visible QR edges.</p>
            </article>
            <article className="how-step">
              <span className="step-number">03</span>
              <div className="step-icon" aria-hidden="true">↗</div>
              <h3>Review the result</h3>
              <p>Read the verdict and reasons before deciding what to do next.</p>
            </article>
          </div>
        </section>

        <section className="workflow" aria-label="QR security check workflow">
          <div className="workflow-heading">
            <div>
              <div className="section-kicker">SECURITY WORKSPACE</div>
              <h2>Payment QR assessment</h2>
            </div>
            <div className="workflow-progress" aria-label={`Current stage: ${stage === "scan" ? "1 of 2, scan" : "2 of 2, assessment"}`}>
              <span className={stage === "scan" ? "current" : "complete"}>01 <b>Scan</b></span>
              <i aria-hidden="true" />
              <span className={stage === "assessment" ? "current" : ""}>02 <b>Assessment</b></span>
            </div>
          </div>

          {stage === "scan" ? (
            <section className="scan-stage stage-enter" id="scan-stage" ref={scanSectionRef} aria-labelledby="scan-title">
              <div className="stage-intro">
                <span className="stage-index">STEP 01</span>
                <h3 id="scan-title">Start with the payment QR</h3>
                <p>Use a clear photo that includes the complete code and its printed border.</p>
              </div>

              <div className="scan-layout">
                <div className="scan-form-card">
                  <input
                    ref={fileInput}
                    className="hidden-input"
                    type="file"
                    accept="image/*"
                    onChange={(event) => selectFile(event.target.files[0])}
                    aria-label="Choose a payment QR image"
                  />

                  <div className="camera-controls">
                    {!cameraOpen ? (
                      <button type="button" className="camera-button" onClick={startCamera}>
                        <span aria-hidden="true">◉</span> Scan with camera
                      </button>
                    ) : (
                      <div className="camera-view">
                        <video ref={videoRef} autoPlay playsInline muted aria-label="Live camera preview of QR code" />
                        <p>Position the complete QR code inside the frame.</p>
                        <div className="camera-actions">
                          <button type="button" className="camera-button" onClick={capturePhoto}>Capture photo</button>
                          <button type="button" className="text-button" onClick={stopCamera}>Close camera</button>
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
                        <img src={preview} alt="Selected QR image preview" />
                        <div className="preview-file-details">
                          <strong>{file.name}</strong>
                          <span>{(file.size / 1024).toFixed(1)} KB · Ready to inspect</span>
                        </div>
                        <button className="text-button" type="button" onClick={resetScan}>Remove image</button>
                      </div>
                    ) : (
                      <>
                        <div className="upload-icon" aria-hidden="true">
                          <svg viewBox="0 0 48 48" fill="none">
                            <path d="M24 31V8m0 0L15 17m9-9 9 9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M9 29v9a2 2 0 0 0 2 2h26a2 2 0 0 0 2-2v-9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                          </svg>
                        </div>
                        <h4>Drop your QR image here</h4>
                        <p>or browse files from your device</p>
                        <button className="browse-button" type="button" onClick={() => fileInput.current?.click()}>
                          Browse files <span aria-hidden="true">↗</span>
                        </button>
                        <span className="file-hint">PNG, JPG or WEBP · Max 10 MB</span>
                      </>
                    )}
                  </div>

                  <div className="field-group">
                    <label htmlFor="merchant">MERCHANT NAME</label>
                    <input
                      id="merchant"
                      type="text"
                      placeholder="e.g. Cafe Mocha, Campus Store..."
                      value={merchant}
                      onChange={(event) => {
                        setMerchant(event.target.value);
                        setResult(null);
                        setStage("scan");
                        setSelectedHistoryId(null);
                        setError("");
                      }}
                    />
                    <span className="field-hint">Enter the shop name shown on the physical QR stand.</span>
                  </div>

                  {error && <div className="error-message" role="alert">{error}</div>}

                  <button className="verify-button" type="button" onClick={verifyQR} disabled={loading}>
                    {loading ? <><span className="loading-spinner" aria-hidden="true" /> Checking QR signals…</> : <>Verify payment QR <span aria-hidden="true">→</span></>}
                  </button>
                  <div className="privacy-note"><span aria-hidden="true">◇</span> Don&apos;t enter your UPI PIN or banking credentials.</div>
                </div>

                <aside className="scan-side-note">
                  <div className="note-icon" aria-hidden="true">!</div>
                  <div className="note-title">A quick safety reminder</div>
                  <p>Argus checks visible QR and payee signals. It does not authenticate the recipient or guarantee payment safety.</p>
                  <div className="note-divider" />
                  <div className="note-check"><span>01</span> Compare the name printed at the shop</div>
                  <div className="note-check"><span>02</span> Confirm the payee again in your UPI app</div>
                </aside>
              </div>
            </section>
          ) : (
            <section className="assessment-stage stage-enter" id="assessment-stage" ref={assessmentRef} aria-labelledby="assessment-title">
              <div className="stage-intro assessment-intro">
                <span className="stage-index">STEP 02 · COMPLETE</span>
                <h3 id="assessment-title">Your security assessment</h3>
                <p>Review the detected payee and the signals behind this risk assessment.</p>
              </div>

              <div className="result-panel">
                <div className="panel-heading">
                  <div>
                    <div className="section-kicker">ASSESSMENT RESULT</div>
                    <h2>QR security check</h2>
                  </div>
                  <span className="live-badge result-ready"><span aria-hidden="true" /> RESULT READY</span>
                </div>

                <div className="result-content">
                  <div className={`verdict-card verdict-${verdictClass}`}>
                    <div className="verdict-symbol" aria-hidden="true">!</div>
                    <div className="verdict-copy">
                      <div className="verdict-overline">RISK ASSESSMENT</div>
                      <h3>{result.verdict}</h3>
                      <p>{result.disclaimer || "This assessment cannot guarantee payment safety."}</p>
                    </div>
                    <div className="risk-score">
                      <strong>{result.risk_score}</strong>
                      <span>RISK SCORE / 100</span>
                    </div>
                  </div>

                  <div className="identity-card">
                    <div className="identity-title">IDENTITY DETAILS</div>
                    <div className="identity-row"><span>Entered merchant</span><strong>{result.merchant_name || merchant}</strong></div>
                    <div className="identity-row"><span>QR payee name</span><strong>{result.payee?.name || "Unavailable"}</strong></div>
                    <div className="identity-row"><span>UPI ID</span><strong>{result.payee?.vpa || "Unavailable"}</strong></div>
                  </div>

                  <div className="reasons-title">ASSESSMENT NOTES</div>
                  <ul className="reason-list">
                    {result.reasons?.map((reason, index) => (
                      <li key={`${reason.code}-${index}`}>
                        <span aria-hidden="true">!</span>
                        <div><strong>{reason.code.replaceAll("_", " ")}</strong><p>{reason.message}</p></div>
                      </li>
                    ))}
                  </ul>

                  <div className="result-warning">
                    This is a risk assessment, not a guarantee of payment safety. Verify the payee independently in your UPI app before authorizing payment.
                  </div>

                  <div className="assessment-actions">
                    <button className="secondary-button" type="button" onClick={() => setStage("scan")}>← Back to scan</button>
                    <button className="verify-button new-scan-button" type="button" onClick={resetScan}>Start a new scan <span aria-hidden="true">↗</span></button>
                  </div>
                </div>
              </div>
            </section>
          )}
        </section>

        <section className="history-section" id="scan-history" ref={historySectionRef} aria-labelledby="scan-history-title">
          <div className="history-heading">
            <div>
              <div className="section-kicker">THIS SESSION</div>
              <h2 id="scan-history-title">Recent scan history</h2>
            </div>
            <span className="history-total">{recentScans.length} / {MAX_RECENT_SCANS}</span>
          </div>

          {recentScans.length === 0 ? (
            <p className="history-empty">Completed scans will appear here until you close or refresh this page.</p>
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
                    <span className={`history-verdict verdict-${verdict}`}>{scan.result.verdict || "UNKNOWN"}</span>
                    <span className="history-details">
                      <strong>{scan.merchantName || "Merchant unavailable"}</strong>
                      <span>Payee: {scan.result.payee?.name || "Unavailable"}{scan.result.payee?.vpa ? ` · ${scan.result.payee.vpa}` : ""}</span>
                      <time dateTime={scan.scannedAt}>{new Date(scan.scannedAt).toLocaleString()}</time>
                    </span>
                    <span className="history-score">{scan.result.risk_score ?? "—"}<small> / 100</small></span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <footer className="page-footer">
          <span>ARGUS <span className="brand-dot">/</span> PAYMENT GUARDIAN</span>
          <span>Built for safer digital payments · Hackathon prototype</span>
        </footer>
      </main>
    </div>
  );
}

export default App;
