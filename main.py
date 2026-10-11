"""FastAPI HTTP interface for the Argus QR verification module."""

from math import isfinite
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from qr_verify import build_verdict, decode_qr_image_bytes, extract_upi_payee
from tamper_detector import analyze_tampering
from merchant_api import final_location_assessment, router as merchant_router

app = FastAPI(
    title="Argus QR Verification API",
    description="Decodes a UPI QR and returns an explainable payee risk assessment.",
    version="0.1.0",
)

# Permit the usual local React development servers. Production deployment
# should replace these with the frontend's deployed origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_methods=["POST", "GET", "PUT", "OPTIONS"],
    allow_headers=["*"],
)
app.include_router(merchant_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/scan")
async def scan_qr(
    file: Annotated[UploadFile, File()],
    merchant_name: Annotated[str, Form()],
    latitude: Annotated[float | None, Form()] = None,
    longitude: Annotated[float | None, Form()] = None,
    accuracy_m: Annotated[float | None, Form()] = None,
    location_status: Annotated[str, Form()] = "unavailable",
) -> dict:
    """Accept QR and optional browser location; return combined risk assessment."""
    if location_status not in {"available", "denied", "unavailable"}:
        raise HTTPException(status_code=422, detail="location_status must be available, denied, or unavailable.")
    if location_status == "available" and (latitude is None or longitude is None):
        raise HTTPException(status_code=422, detail="Coordinates are required when location_status is available.")
    if latitude is not None and (not isfinite(latitude) or not -90 <= latitude <= 90):
        raise HTTPException(status_code=422, detail="Latitude must be between -90 and 90.")
    if longitude is not None and (not isfinite(longitude) or not -180 <= longitude <= 180):
        raise HTTPException(status_code=422, detail="Longitude must be between -180 and 180.")
    if accuracy_m is not None and (not isfinite(accuracy_m) or not 0 <= accuracy_m <= 10000):
        raise HTTPException(status_code=422, detail="GPS accuracy must be between 0 and 10000 metres.")
    try:
        image_bytes = await file.read()
        if not image_bytes:
            raise ValueError("Uploaded file is empty")
        payload, image, qr_corners = decode_qr_image_bytes(image_bytes)
        payee = extract_upi_payee(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    finally:
        await file.close()

    try:
        tamper_result = analyze_tampering(image, qr_corners)
    except Exception as exc:
        tamper_result = {
            "tamper_score": None,
            "tamper_reasons": [f"Tamper analysis unavailable: {exc}"],
        }

    verdict = build_verdict(
        payee,
        merchant_name,
        tamper_score=tamper_result.get("tamper_score"),
        tamper_reasons=tamper_result.get("tamper_reasons", []),
    )
    return final_location_assessment(
        verdict,
        payee.vpa,
        latitude,
        longitude,
        accuracy_m,
        location_status,
    )
