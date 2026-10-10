import { useEffect, useRef, useState } from "react";
import { scanQR } from "./argusApi";
import "./App.css";

function App() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [merchant, setMerchant] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraOpen, setCameraOpen] = useState(false);

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

    try {
      const data = await scanQR(file, merchant.trim());
      setResult(data);
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
    setError("");
    if (fileInput.current) fileInput.current.value = "";
  }

  const verdictClass = result?.verdict ? result.verdict.toLowerCase() : "";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="Argus home">
          <div className="brand-icon">
            <img src="/argus-head.png" alt="" />
          </div>
          <span>
            <img src="/argus-logo.png" alt="ARGUS" className="brand-logo" />
          </span>
        </a>

        <div className="side-label">WORKSPACE</div>
        <div className="nav-item active">
          <span>⌗</span> QR Verification
        </div>
        <div className="nav-item muted">
          <span>◷</span> Scan History
          <span className="coming-soon">Soon</span>
        </div>

        <div className="sidebar-bottom">
          <div className="status-dot" />
          <span>Prototype environment</span>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> QR Verification
          </div>
          <div className="topbar-tag">
            <span /> PAYMENT SECURITY
          </div>
        </header>

        <section className="page-heading hero-heading">
          <div className="hero-copy">
            <div className="eyebrow">YOUR PAYMENT SAFETY CHECK</div>
            <h1>
              Pause. Scan. <span>Verify.</span>
            </h1>
            <p>
              Check a UPI QR code for potential warning signs before you make a
              payment.
            </p>
          </div>

          <div className="hero-mascot-wrap">
            <img
              src="/argus-mascot.png"
              alt="Argus yellow robot mascot"
              className="hero-mascot"
            />
          </div>
        </section>

        <div className="notice">
          <span className="notice-icon">i</span>

          <p>
            <strong>Prototype notice</strong> Argus checks available QR and
            payee signals for potential warning signs. This risk assessment
            cannot guarantee payment safety.
          </p>
        </div>

        <div className="workspace-grid">
          <section className="panel scan-panel">
            <div className="panel-heading">
              <div>
                <div className="step-label">STEP 01</div>
                <h2>Scan a QR code</h2>
              </div>
              <span className="panel-icon">⌗</span>
            </div>

            <p className="panel-description">
              Upload a clear image of the payment QR code.
            </p>

            <input
              ref={fileInput}
              className="hidden-input"
              type="file"
              accept="image/*"
              onChange={(event) => selectFile(event.target.files[0])}
            />

            <div className="camera-controls">
              {!cameraOpen ? (
                <button
                  type="button"
                  className="camera-button"
                  onClick={startCamera}
                >
                  <span aria-hidden="true">📷</span>
                  Scan with Camera
                </button>
              ) : (
                <div className="camera-view">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    aria-label="Live camera preview of QR code"
                  />

                  <p>Position the complete QR code inside the frame.</p>

                  <div className="camera-actions">
                    <button
                      type="button"
                      className="camera-button"
                      onClick={capturePhoto}
                    >
                      Capture Photo
                    </button>

                    <button
                      type="button"
                      className="text-button"
                      onClick={stopCamera}
                    >
                      Close Camera
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div
              className={`upload-area ${dragging ? "dragging" : ""} ${preview ? "has-preview" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
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
                  <strong>{file.name}</strong>
                  <span>{(file.size / 1024).toFixed(1)} KB</span>
                  <button className="text-button" onClick={resetScan}>
                    Remove image
                  </button>
                </div>
              ) : (
                <>
                  <div className="upload-icon">
                    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
                      <path
                        d="M24 31V8m0 0L15 17m9-9 9 9"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M9 29v9a2 2 0 0 0 2 2h26a2 2 0 0 0 2-2v-9"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                  <h3>Drop your QR image here</h3>
                  <p>or browse files from your device</p>
                  <button
                    className="browse-button"
                    onClick={() => fileInput.current?.click()}
                  >
                    Browse files <span>↗</span>
                  </button>
                  <span className="file-hint">
                    PNG, JPG or WEBP · Max 10 MB
                  </span>
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
                  setError("");
                }}
              />
              <span className="field-hint">
                Enter the shop name shown on the physical QR stand.
              </span>
            </div>

            {error && (
              <div className="error-message" role="alert">
                {error}
              </div>
            )}

            <button
              className="verify-button"
              onClick={verifyQR}
              disabled={loading}
            >
              {loading ? "Analyzing QR..." : "Verify payment QR"}
              {!loading && <span>→</span>}
            </button>
            <div className="privacy-note">
              <span>◇</span> Don't enter your UPI PIN or banking credentials.
            </div>
          </section>

          <section className="panel result-panel">
            <div className="panel-heading">
              <div>
                <div className="step-label">STEP 02</div>
                <h2>Security assessment</h2>
              </div>
              <span className={`live-badge ${result ? "result-ready" : ""}`}>
                <span />
                {result ? "RESULT READY" : "READY TO SCAN"}
              </span>
            </div>

            {!result ? (
              <div className="empty-result">
                <div className="scan-illustration">
                  <div className="scan-corner corner-tl" />
                  <div className="scan-corner corner-tr" />
                  <div className="scan-corner corner-bl" />
                  <div className="scan-corner corner-br" />
                  <div className="fake-qr">
                    {Array.from({ length: 49 }, (_, i) => (
                      <span
                        key={i}
                        className={
                          (i * 7 + Math.floor(i / 7) * 3) % 5 < 2
                            ? "qr-dark"
                            : ""
                        }
                      />
                    ))}
                  </div>
                  <div className="scan-line" />
                </div>
                <h3>Nothing scanned yet</h3>
                <p>
                  Your security assessment will appear here after you upload a
                  QR image and enter a merchant name.
                </p>
                <div className="check-list">
                  <div>
                    <span>01</span> Payee identity comparison
                  </div>
                  <div>
                    <span>02</span> Visual tampering signals
                  </div>
                  <div>
                    <span>03</span> Risk explanation
                  </div>
                </div>
              </div>
            ) : (
              <div className="result-content">
                <div className={`verdict-card verdict-${verdictClass}`}>
                  <div className="verdict-symbol">!</div>

                  <div>
                    <div className="verdict-overline">RISK ASSESSMENT</div>
                    <h3>{result.verdict}</h3>
                    <p>
                      {result.disclaimer ||
                        "This assessment cannot guarantee payment safety."}
                    </p>
                  </div>

                  <div className="risk-score">
                    <strong>{result.risk_score}</strong>
                    <span>RISK SCORE / 100</span>
                  </div>
                </div>

                <div className="identity-card">
                  <div className="identity-title">IDENTITY DETAILS</div>

                  <div className="identity-row">
                    <span>Entered merchant</span>
                    <strong>{result.merchant_name || merchant}</strong>
                  </div>

                  <div className="identity-row">
                    <span>QR payee name</span>
                    <strong>{result.payee?.name || "Unavailable"}</strong>
                  </div>

                  <div className="identity-row">
                    <span>UPI ID</span>
                    <strong>{result.payee?.vpa || "Unavailable"}</strong>
                  </div>
                </div>

                <div className="reasons-title">ASSESSMENT NOTES</div>

                <ul className="reason-list">
                  {result.reasons?.map((reason, index) => (
                    <li key={`${reason.code}-${index}`}>
                      <span>!</span>
                      <div>
                        <strong>{reason.code.replaceAll("_", " ")}</strong>
                        <p>{reason.message}</p>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="result-warning">
                  This assessment is not a guarantee of payment safety. Verify
                  the payee independently in your UPI app before authorizing
                  payment.
                </div>

                <button className="secondary-button" onClick={resetScan}>
                  ← Start a new scan
                </button>
              </div>
            )}
          </section>
        </div>

        <footer className="page-footer">
          <span>
            ARGUS <span className="brand-dot">/</span> PAYMENT GUARDIAN
          </span>
          <span>Built for safer digital payments · Hackathon prototype</span>
        </footer>
      </main>
    </div>
  );
}

export default App;
