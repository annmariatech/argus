"""FastAPI HTTP interface for the Argus QR verification module."""

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from qr_verify import build_verdict, decode_qr_bytes, extract_upi_payee

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
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/scan")
async def scan_qr(
    file: UploadFile = File(...),
    merchant_name: str = Form(...),
) -> dict:
    """Accept multipart fields `file` and `merchant_name`; return verdict JSON."""
    try:
        image_bytes = await file.read()
        if not image_bytes:
            raise ValueError("Uploaded file is empty")
        payload = decode_qr_bytes(image_bytes)
        payee = extract_upi_payee(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    finally:
        await file.close()

    return build_verdict(payee, merchant_name)
