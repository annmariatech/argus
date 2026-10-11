# Argus

An on-device vision prototype for assessing payment QR codes for possible
tampering and payee/merchant mismatches.

## Ann's module: QR and payee verification

`qr_verify.py` decodes a QR image with OpenCV, extracts `pn` (payee name) and
`pa` (VPA) from `upi://pay` payloads, and combines those values with the
merchant name and the tamper detector's optional score/reasons.

OpenCV (`cv2`) must be available to decode image files. The module accepts
tamper scores from 0 to 100. Example:

```python
from qr_verify import assess_qr_image

result = assess_qr_image(
    "payment-qr.png",
    merchant_name="Green Mart",  # manual input or OCR output
    tamper_score=8,              # Devika module; None if unavailable
    tamper_reasons=[],
)
```

The stable result contract is:

```json
{
  "verdict": "SAFE | SUSPICIOUS | DANGER",
  "risk_score": 0,
  "payee": {"name": "Green Mart", "vpa": "shop@okbank"},
  "merchant_name": "Green Mart",
  "reasons": [{"code": "NAME_MATCH", "message": "..."}],
  "disclaimer": "..."
}
```

`build_verdict(payee, merchant_name, tamper_score, tamper_reasons)` is the
integration entry point when the frontend or another module already has a
decoded payload. Verdict bands are SAFE below 20, SUSPICIOUS from 20 through
69, and DANGER from 70 upward. Missing comparison evidence adds risk and
cannot silently result in SAFE. These are explainable heuristics, not payment
authentication or a guarantee of safety.

Run the module's independent checks with `python -m unittest test_qr_verify`.

## Model-input preparation

`risk_features.py` provides `extract_risk_features(payee, merchant_name,
tamper_result)`. It returns numeric inputs and explicit missing indicators for
the payee/name comparison, VPA, tamper score, and each raw tamper measurement.
Unavailable values remain `None`; invalid, non-finite, or out-of-range values
raise `ValueError` rather than being silently replaced. The name similarity
and match flags use the same comparison thresholds as `build_verdict()`.
This is feature preparation only: there is no trained model or ML prediction.

The detector preserves `tamper_score` and `tamper_reasons` and now also returns
`side_imbalance`, `angle_deviation`, `edge_score`, `roughness_score`,
`contour_irregularity`, `corner_abuse_score`, and `texture_difference`. Those
measurement fields are `None` when unavailable; partial analyses retain any
measurements that were calculated.

## HTTP API for the React frontend

The FastAPI server exposes `POST /api/scan`. It accepts multipart form data
with the QR image in `file` and the displayed shop name in `merchant_name`.
The endpoint decodes the image once, then passes the decoded OpenCV image and
QR boundary coordinates to Devika's `tamper_detector.analyze_tampering`.
Its `tamper_score` and `tamper_reasons` are included in the combined verdict.
If the detector cannot analyze the image, the response explains that and
scores the missing signal as risk rather than claiming the image was checked.

```bash
python3 -m pip install -r requirements.txt
uvicorn main:app --reload
```

The API runs at `http://localhost:8000`; its interactive documentation is at
`http://localhost:8000/docs`. The local React origins `localhost:3000` and
`localhost:5173` are allowed for development. Example frontend request:

```javascript
const form = new FormData();
form.append("file", qrImageFile);
form.append("merchant_name", shopName);
const response = await fetch("http://localhost:8000/api/scan", {
  method: "POST",
  body: form,
});
const verdict = await response.json();
```

## Scam Hotspot Map and support chat

The **Scam Hotspot Map** page groups user-submitted `DANGER` scan reports by
distance and displays them on Leaflet/OpenStreetMap. Yellow means one report,
orange means two or three, and red means more than three reports in a group.
The grouping radius defaults to 250 metres and can be set with
`ARGUS_HOTSPOT_RADIUS_M` (25–10,000 metres). Reports and counts live only in
the FastAPI process memory, so they reset when the server restarts and are not
shared across multiple server workers. They are explicitly unverified; a high
count does not establish that a QR or place is a scam. Users must explicitly
choose to share browser location or click a point on the map. OpenStreetMap
tiles require an internet connection.

For the support chat, install backend requirements (including `httpx`) and
set your Groq key in the environment of the terminal that runs FastAPI:

```bash
export GROQ_API_KEY='your-groq-api-key'
uvicorn main:app --reload
```

Optionally set `GROQ_MODEL` to a model available to your Groq account. The key
stays on the server and is never sent to the browser. Without the key, the
chat UI displays a setup message; the rest of Argus still works.
