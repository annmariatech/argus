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
