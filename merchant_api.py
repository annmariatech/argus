"""Merchant Mode HTTP endpoints and final-stage QR/location verification."""

import hmac
import os
import re
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field, field_validator

import merchant_registry as registry
from location_verification import verify_location

router = APIRouter(prefix="/api/merchant", tags=["Merchant Mode"])
registry.init_db()


class MerchantInput(BaseModel):
    shop_name: str = Field(min_length=2, max_length=120)
    upi_id: str = Field(min_length=5, max_length=100)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    radius_m: float = Field(default=150, ge=25, le=5000)

    @field_validator("shop_name")
    @classmethod
    def shop_name_not_blank(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Shop name must contain at least 2 characters.")
        return value

    @field_validator("upi_id")
    @classmethod
    def valid_vpa(cls, value: str) -> str:
        value = value.strip()
        if not re.fullmatch(r"[A-Za-z0-9._-]{2,256}@[A-Za-z0-9.-]{2,64}", value):
            raise ValueError("Enter a valid UPI ID, such as shop@bank.")
        return value.lower()


class RegisterInput(MerchantInput):
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=10, max_length=256)

    @field_validator("email")
    @classmethod
    def valid_email(cls, value: str) -> str:
        value = value.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Enter a valid email address.")
        return value


class LoginInput(BaseModel):
    email: str
    password: str


def _account_id(authorization: str | None = Header(default=None)) -> tuple[int, str]:
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Sign in to manage your merchant profile.")
    account_id = registry.account_for_token(token)
    if account_id is None:
        raise HTTPException(status_code=401, detail="Session expired. Please sign in again.")
    return account_id, token


@router.post("/register", status_code=201)
def register_merchant(data: RegisterInput) -> dict:
    try:
        merchant = registry.register(data.email, data.password, data.shop_name, data.upi_id,
                                     data.latitude, data.longitude, data.radius_m)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"merchant": merchant, "message": "Merchant profile created. UPI ownership is pending independent verification."}


@router.post("/login")
def login_merchant(data: LoginInput) -> dict:
    result = registry.authenticate(data.email, data.password)
    if result is None:
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    token, merchant = result
    return {"access_token": token, "token_type": "bearer", "merchant": merchant}


@router.get("/me")
def get_my_merchant(auth: tuple[int, str] = Depends(_account_id)) -> dict:
    merchant = registry.get_merchant(auth[0])
    if merchant is None:
        raise HTTPException(status_code=404, detail="Merchant profile not found.")
    return {"merchant": merchant}


@router.put("/me")
def update_my_merchant(data: MerchantInput, auth: tuple[int, str] = Depends(_account_id)) -> dict:
    try:
        merchant = registry.update_merchant(auth[0], data.shop_name, data.upi_id, data.latitude,
                                            data.longitude, data.radius_m)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if merchant is None:
        raise HTTPException(status_code=404, detail="Merchant profile not found.")
    return {"merchant": merchant}


@router.post("/logout")
def logout_merchant(auth: tuple[int, str] = Depends(_account_id)) -> dict[str, str]:
    registry.logout(auth[1])
    return {"status": "signed_out"}


def _require_operator(authorization: str | None) -> None:
    expected = os.environ.get("ARGUS_ADMIN_TOKEN")
    scheme, _, bearer = (authorization or "").partition(" ")
    if not expected or scheme.lower() != "admin" or not hmac.compare_digest(bearer, expected):
        raise HTTPException(status_code=403, detail="Authorized operator access is required.")


@router.get("/operator/pending")
def operator_pending_merchants(authorization: str | None = Header(default=None)) -> dict:
    _require_operator(authorization)
    return {"merchants": registry.pending_merchants()}


@router.post("/operator/verify-upi/{merchant_id}")
def operator_verify_upi(merchant_id: int, verified: bool, authorization: str | None = Header(default=None)) -> dict:
    """Set review status after the operator independently checks UPI ownership."""
    _require_operator(authorization)
    merchant = registry.verify_upi(merchant_id, verified)
    if merchant is None:
        raise HTTPException(status_code=404, detail="Merchant profile not found.")
    return {"merchant": merchant}


def final_location_assessment(
    verdict: dict,
    payee_vpa: str | None,
    latitude: float | None,
    longitude: float | None,
    accuracy_m: float | None,
    location_status: Literal["available", "denied", "unavailable"],
) -> dict:
    merchant = registry.merchant_for_vpa(payee_vpa)
    location_result = verify_location(payee_vpa, latitude, longitude, accuracy_m, location_status, merchant)
    verdict["location_verification"] = location_result
    penalties = {
        "LOCATION_MISMATCH": (70, "The device is outside the registered merchant location radius."),
        "UNKNOWN_MERCHANT": (25, "No merchant record matches this QR's UPI ID."),
        "UPI_NOT_VERIFIED": (20, "The matching merchant's UPI ID is pending independent verification."),
        "LOCATION_PERMISSION_DENIED": (20, "Location permission was denied, so merchant proximity could not be verified."),
        "LOCATION_UNAVAILABLE": (20, "Device location is unavailable, so merchant proximity could not be verified."),
        "LOCATION_UNCERTAIN": (20, "GPS accuracy overlaps the merchant radius; proximity is uncertain."),
    }
    additions = [penalties[location_result["status"]]] if location_result["status"] in penalties else []
    if location_status == "denied" and location_result["status"] != "LOCATION_PERMISSION_DENIED":
        additions.append((20, "Location permission was denied, so merchant proximity could not be verified."))
    elif location_status == "unavailable" and location_result["status"] != "LOCATION_UNAVAILABLE":
        additions.append((20, "Device location is unavailable, so merchant proximity could not be verified."))
    for amount, message in additions:
        verdict["risk_score"] = min(100, verdict["risk_score"] + amount)
        code = "LOCATION_PERMISSION_DENIED" if "permission was denied" in message else "LOCATION_UNAVAILABLE" if "location is unavailable" in message else location_result["status"]
        verdict["reasons"].append({"code": code, "message": message})
        score = verdict["risk_score"]
        verdict["verdict"] = "DANGER" if score >= 70 else "SUSPICIOUS" if score >= 20 else "SAFE"
    return verdict
