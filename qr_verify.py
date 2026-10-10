"""QR decoding, UPI payee extraction, and explainable verdicts for Argus MVP.

The public result keys in this module are the integration contract shared with
the frontend and tamper detector. Scores are heuristic risk assessments, not
payment authentication.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Mapping
from urllib.parse import parse_qs, urlparse
import re

from risk_features import compare_payee_name


@dataclass(frozen=True)
class Payee:
    name: str | None
    vpa: str | None


def decode_qr_image(image_path: str | Path) -> str:
    """Decode one QR code from an image file using OpenCV's built-in detector."""
    image_bytes = Path(image_path).read_bytes()
    return decode_qr_bytes(image_bytes)


def decode_qr_bytes(image_bytes: bytes) -> str:
    """Decode one QR code from uploaded image bytes."""
    payload, _, _ = decode_qr_image_bytes(image_bytes)
    return payload


def decode_qr_image_bytes(image_bytes: bytes) -> tuple[str, Any, Any]:
    """Decode uploaded image bytes and return payload, image, and QR corners."""
    try:
        import cv2  # type: ignore[import-not-found]
        import numpy as np
    except ImportError as exc:
        raise RuntimeError("QR image decoding requires OpenCV and NumPy") from exc

    image = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Uploaded file is not a readable image")
    payload, points, _ = cv2.QRCodeDetector().detectAndDecode(image)
    if not payload or points is None:
        raise ValueError("No readable QR code was found in the image")
    return payload.strip(), image, points


def extract_upi_payee(payload: str) -> Payee:
    """Extract `pn` (payee name) and `pa` (VPA) from a UPI intent payload."""
    text = payload.strip()
    parsed = urlparse(text)
    if parsed.scheme.lower() != "upi" or parsed.netloc.lower() != "pay":
        raise ValueError("QR payload is not a UPI payment link (upi://pay)")
    query = parse_qs(parsed.query, keep_blank_values=False)
    name = _first(query, "pn")
    vpa = _first(query, "pa")
    if vpa and not _looks_like_vpa(vpa):
        vpa = None
    return Payee(name=name, vpa=vpa)


def build_verdict(
    payee: Payee | Mapping[str, Any],
    merchant_name: str | None,
    tamper_score: float | None = None,
    tamper_reasons: list[str] | None = None,
) -> dict[str, Any]:
    """Combine available payee/name and visual-tamper evidence into a verdict.

    `tamper_score` is on a 0-100 scale. The tamper module may pass its
    explanation strings unchanged as `tamper_reasons`.
    """
    if not isinstance(payee, Payee):
        payee = Payee(name=payee.get("name"), vpa=payee.get("vpa"))

    reasons: list[dict[str, str]] = []
    score = 0
    comparison = compare_payee_name(payee.name, merchant_name)
    similarity = comparison["payee_name_similarity"]
    if similarity is not None:
        if comparison["name_match"]:
            reasons.append({"code": "NAME_MATCH", "message": "The QR payee name matches the merchant name."})
        elif comparison["name_partial_match"]:
            score += 30
            reasons.append({"code": "NAME_PARTIAL_MATCH", "message": "The QR payee name is similar, but does not clearly match the merchant."})
        else:
            score += 55
            reasons.append({"code": "NAME_MISMATCH", "message": "The QR payee name does not match the merchant name."})
    elif comparison["payee_name_missing"]:
        score += 20
        reasons.append({"code": "PAYEE_NAME_MISSING", "message": "The QR code does not provide a payee name to compare."})
    elif comparison["merchant_name_missing"]:
        score += 20
        reasons.append({"code": "MERCHANT_NAME_MISSING", "message": "A merchant name was not provided or could not be read."})

    if not payee.vpa:
        score += 10
        reasons.append({"code": "VPA_MISSING", "message": "A valid UPI address (VPA) was not found in the QR payload."})

    if tamper_score is None:
        score += 20
        reasons.append({"code": "TAMPER_UNAVAILABLE", "message": "Visual tamper analysis is unavailable, so the QR image could not be checked for alteration."})
    else:
        tamper = max(0, min(100, float(tamper_score)))
        score += round(tamper * 0.55)
        if tamper >= 70:
            reasons.append({"code": "TAMPER_HIGH", "message": "Visual analysis found strong signs that the QR image may have been altered."})
        elif tamper >= 30:
            reasons.append({"code": "TAMPER_POSSIBLE", "message": "Visual analysis found possible signs of QR image alteration."})
        else:
            reasons.append({"code": "TAMPER_LOW", "message": "Visual analysis found few signs of QR image alteration."})

    for message in tamper_reasons or []:
        reasons.append({"code": "TAMPER_DETAIL", "message": str(message)})

    score = min(100, score)
    if score >= 70:
        verdict = "DANGER"
    elif score >= 20:
        verdict = "SUSPICIOUS"
    else:
        verdict = "SAFE"

    return {
        "verdict": verdict,
        "risk_score": score,
        "payee": asdict(payee),
        "merchant_name": merchant_name.strip() if merchant_name else None,
        "reasons": reasons,
        "disclaimer": "This is a risk assessment, not a guarantee of payment safety. QR decoding does not authenticate a payee.",
    }


def assess_qr_image(
    image_path: str | Path,
    merchant_name: str | None,
    tamper_score: float | None = None,
    tamper_reasons: list[str] | None = None,
) -> dict[str, Any]:
    """Decode an uploaded image, parse the UPI payee, and return its verdict."""
    payload = decode_qr_image(image_path)
    payee = extract_upi_payee(payload)
    return build_verdict(payee, merchant_name, tamper_score, tamper_reasons)


def _first(query: Mapping[str, list[str]], key: str) -> str | None:
    value = query.get(key, [None])[0]
    return value.strip() if value and value.strip() else None


def _looks_like_vpa(value: str) -> bool:
    return bool(re.fullmatch(r"[A-Za-z0-9._-]{2,256}@[A-Za-z0-9.-]{2,64}", value))
