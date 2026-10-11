import asyncio
from datetime import datetime, timezone

import pytest
from pydantic import ValidationError
from fastapi import HTTPException
from fastapi.testclient import TestClient

import hotspot_api
from hotspot_api import ReportInput, group_reports
from support_api import ChatInput, support_chat
from main import app


def make_report(index, latitude=10.0, longitude=76.0):
    return {
        "id": str(index),
        "latitude": latitude,
        "longitude": longitude,
        "verdict": "DANGER",
        "risk_score": 85,
        "merchant_name": "Demo Shop",
        "payee_name": "Unknown Payee",
        "reasons": ["NAME_MISMATCH"],
        "reported_at": datetime.now(timezone.utc).isoformat(),
        "verified": False,
    }


def test_nearby_reports_group_and_color_updates():
    reports = [make_report(i, longitude=76 + i * 0.0001) for i in range(4)]
    hotspot = group_reports(reports, 250)
    assert len(hotspot) == 1
    assert hotspot[0]["count"] == 4
    assert hotspot[0]["color"] == "red"
    assert all(item["verified"] is False for item in hotspot[0]["reports"])


def test_single_report_is_yellow_and_separated_reports_stay_separate():
    groups = group_reports([make_report(1), make_report(2, latitude=12.0)], 250)
    assert len(groups) == 2
    assert [group["color"] for group in groups] == ["yellow", "yellow"]


def test_two_and_three_reports_are_orange():
    for count in (2, 3):
        group = group_reports([make_report(i, longitude=76 + i * 0.0001) for i in range(count)], 250)[0]
        assert group["count"] == count
        assert group["color"] == "orange"


def test_only_danger_verdicts_can_be_reported():
    valid = ReportInput(latitude=10, longitude=76, verdict="danger", risk_score=90)
    assert valid.verdict == "DANGER"
    with pytest.raises(ValidationError):
        ReportInput(latitude=10, longitude=76, verdict="SAFE", risk_score=5)


def test_new_report_is_unverified_and_appears_in_hotspot(monkeypatch):
    monkeypatch.setattr(hotspot_api, "_reports", [])
    created = hotspot_api.create_report(ReportInput(
        latitude=10, longitude=76, verdict="DANGER", risk_score=90,
        merchant_name="Demo Shop", reasons=["TAMPER_HIGH"],
    ))
    assert created["report"]["verified"] is False
    assert hotspot_api.get_hotspots()["hotspots"][0]["count"] == 1


@pytest.mark.parametrize("latitude,longitude", [(91, 0), (0, 181)])
def test_invalid_coordinates_are_rejected(latitude, longitude):
    with pytest.raises(ValidationError):
        ReportInput(latitude=latitude, longitude=longitude, verdict="DANGER", risk_score=90)


def test_support_chat_explains_missing_server_key(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    with pytest.raises(HTTPException) as error:
        asyncio.run(support_chat(ChatInput(message="How do I use this?")))
    assert error.value.status_code == 503
    assert "GROQ_API_KEY" in error.value.detail


def test_hotspot_http_api_accepts_and_lists_a_report(monkeypatch):
    monkeypatch.setattr(hotspot_api, "_reports", [])
    client = TestClient(app)
    response = client.post("/api/hotspots/reports", json={
        "latitude": 10,
        "longitude": 76,
        "verdict": "DANGER",
        "risk_score": 90,
        "merchant_name": "Demo Shop",
        "reasons": ["TAMPER_HIGH"],
    })
    assert response.status_code == 201
    assert response.json()["report"]["verified"] is False
    listing = client.get("/api/hotspots")
    assert listing.status_code == 200
    assert listing.json()["hotspots"][0]["count"] == 1
