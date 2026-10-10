
import { useRef, useState } from "react";
import "./App.css";

function App() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [merchant, setMerchant] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef(null);

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

  function verifyQR() {
    if (!file) {
      setError("Upload a QR image to get started.");
      return;
    }

    if (!merchant.trim()) {
      setError("Enter the merchant name displayed at the shop.");
      return;
    }

    // Temporary demo result. Real QR decoding and tamper
    // detection will be connected through the team API.
    setResult({
      verdict: "SUSPICIOUS",
      score: 42,
      payee: "Demo Store",
      vpa: "demo@upi",
      reasons: [
        "Demo result only — the QR has not been decoded.",
        "Merchant identity has not been independently verified.",
        "Physical tampering detection is not connected yet.",
      ],
    });

    setError("");
  }

  function resetScan() {
    setFile(null);
    setPreview("");
    setMerchant("");
    setResult(null);
    setError("");
    if (fileInput.current) fileInput.current.value = "";
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="Argus home">
          <span className="brand-icon">A</span>
          <span>argus<span className="brand-dot">.</span></span>
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
          <div className="breadcrumb">Workspace <span>/</span> QR Verification</div>
          <div className="topbar-tag"><span /> PAYMENT SECURITY</div>
        </header>

        <section className="page-heading">
          <div className="eyebrow">YOUR PAYMENT SAFETY CHECK</div>
          <h1>Pause. Scan. <span>Verify.</span></h1>
          <p>
            Check a UPI QR code for potential warning signs before
            you make a payment.
          </p>
        </section>

        <div className="notice">
          <span className="notice-icon">i</span>
          <p>
            <strong>Prototype notice</strong>
            {" "}This interface currently uses demo results. It does not
            verify real QR codes or guarantee payment safety.
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
                      <path d="M24 31V8m0 0L15 17m9-9 9 9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M9 29v9a2 2 0 0 0 2 2h26a2 2 0 0 0 2-2v-9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
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
                  setError("");
                }}
              />
              <span className="field-hint">
                Enter the shop name shown on the physical QR stand.
              </span>
            </div>

            {error && <div className="error-message" role="alert">{error}</div>}

            <button className="verify-button" onClick={verifyQR}>
              Verify payment QR <span>→</span>
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
              <span className="live-badge"><span /> DEMO</span>
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
                          ((i * 7 + Math.floor(i / 7) * 3) % 5 < 2)
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
                  Your security assessment will appear here after
                  you upload a QR image and enter a merchant name.
                </p>
                <div className="check-list">
                  <div><span>01</span> Payee identity comparison</div>
                  <div><span>02</span> Visual tampering signals</div>
                  <div><span>03</span> Risk explanation</div>
                </div>
              </div>
            ) : (
              <div className="result-content">
                <div className="verdict-card">
                  <div className="verdict-symbol">!</div>
                  <div>
                    <div className="verdict-overline">DEMO VERDICT</div>
                    <h3>{result.verdict}</h3>
                    <p>Illustrative result — not a real security check.</p>
                  </div>
                  <div className="risk-score">
                    <strong>{result.score}</strong>
                    <span>DEMO SCORE</span>
                  </div>
                </div>

                <div className="identity-card">
                  <div className="identity-title">IDENTITY DETAILS</div>
                  <div className="identity-row">
                    <span>Entered merchant</span>
                    <strong>{merchant}</strong>
                  </div>
                  <div className="identity-row">
                    <span>Example QR payee</span>
                    <strong>{result.payee}</strong>
                  </div>
                  <div className="identity-row">
                    <span>Example UPI ID</span>
                    <strong>{result.vpa}</strong>
                  </div>
                </div>

                <div className="reasons-title">ASSESSMENT NOTES</div>
                <ul className="reason-list">
                  {result.reasons.map((reason, index) => (
                    <li key={index}><span>!</span>{reason}</li>
                  ))}
                </ul>

                <div className="result-warning">
                  Never pay based on this demo result. Verify the payee
                  independently in your UPI app before authorizing payment.
                </div>

                <button className="secondary-button" onClick={resetScan}>
                  ← Start a new scan
                </button>
              </div>
            )}
          </section>
        </div>

        <footer className="page-footer">
          <span>ARGUS <span className="brand-dot">/</span> PAYMENT GUARDIAN</span>
          <span>Built for safer digital payments · Hackathon prototype</span>
        </footer>
      </main>
    </div>
  );
}

export default App;
