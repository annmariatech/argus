"""Temporary, explicitly unverified user reports for dangerous QR locations."""

import os
from datetime import datetime, timezone
from math import asin, cos, radians, sin, sqrt
from threading import Lock
from uuid import uuid4

from fastapi import APIRouter
from pydantic import BaseModel, Field, field_validator

router = APIRouter(prefix="/api/hotspots", tags=["Scam Hotspots"])
_reports: list[dict] = []
_lock = Lock()
EARTH_RADIUS_M = 6_371_000


class ReportInput(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    verdict: str
    risk_score: int = Field(ge=0, le=100)
    merchant_name: str = Field(default="", max_length=120)
    payee_name: str = Field(default="", max_length=120)
    reasons: list[str] = Field(default_factory=list, max_length=12)

    @field_validator("verdict")
    @classmethod
    def only_danger_reports(cls, value: str) -> str:
        if value.upper() != "DANGER":
            raise ValueError("Only scans with a DANGER verdict can be reported.")
        return "DANGER"


def _distance_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1, lat2, lon2 = map(radians, (a[0], a[1], b[0], b[1]))
    dlat, dlon = lat2 - lat1, lon2 - lon1
    hav = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_M * asin(sqrt(min(1.0, hav)))


def group_reports(reports: list[dict], radius_m: float) -> list[dict]:
    """Greedily group reports within radius of each hotspot's running centroid."""
    groups: list[dict] = []
    for report in reports:
        point = (report["latitude"], report["longitude"])
        group = next(
            (candidate for candidate in groups
             if _distance_m(point, (candidate["latitude"], candidate["longitude"])) <= radius_m),
            None,
        )
        if group is None:
            group = {"id": str(uuid4()), "latitude": point[0], "longitude": point[1], "count": 0, "reports": []}
            groups.append(group)
        group["reports"].append(report)
        group["count"] = len(group["reports"])
        group["latitude"] = sum(item["latitude"] for item in group["reports"]) / group["count"]
        group["longitude"] = sum(item["longitude"] for item in group["reports"]) / group["count"]
        group["color"] = "yellow" if group["count"] == 1 else "orange" if group["count"] <= 3 else "red"
    return groups


@router.get("")
def get_hotspots() -> dict:
    try:
        radius_m = float(os.environ.get("ARGUS_HOTSPOT_RADIUS_M", "250"))
    except ValueError:
        radius_m = 250
    if not 25 <= radius_m <= 10000:
        radius_m = 250
    with _lock:
        reports = list(_reports)
    return {"hotspots": group_reports(reports, radius_m), "radius_m": radius_m, "verified": False}


@router.post("/reports", status_code=201)
def create_report(data: ReportInput) -> dict:
    report = data.model_dump()
    report.update({"id": str(uuid4()), "reported_at": datetime.now(timezone.utc).isoformat(), "verified": False})
    with _lock:
        _reports.append(report)
        # Keep memory use bounded in the prototype.
        if len(_reports) > 2000:
            del _reports[:len(_reports) - 2000]
    return {"report": report, "message": "Report added as unverified community information."}


