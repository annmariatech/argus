"""Location verification helpers, independent of image tamper analysis."""

from math import asin, cos, radians, sin, sqrt
from typing import Any


def haversine_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return great-circle distance between two WGS84 coordinates in metres."""
    earth_radius_m = 6_371_000
    d_lat = radians(lat2 - lat1)
    d_lon = radians(lon2 - lon1)
    term = sin(d_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lon / 2) ** 2
    return 2 * earth_radius_m * asin(sqrt(min(1.0, term)))


def verify_location(
    payee_vpa: str | None,
    current_latitude: float | None,
    current_longitude: float | None,
    accuracy_m: float | None,
    location_status: str,
    merchant: dict[str, Any] | None,
) -> dict[str, Any]:
    """Compare exact payee VPA and the reported device location to a registry record."""
    result: dict[str, Any] = {
        "status": "UNKNOWN_MERCHANT",
        "detected_upi_id": payee_vpa,
        "matched_merchant": None,
        "current_location": None,
        "registered_location": None,
        "distance_m": None,
        "accuracy_m": accuracy_m,
        "radius_m": None,
        "device_location_status": location_status,
        "location_message": {
            "denied": "Location permission was denied.",
            "unavailable": "Device location is unavailable.",
            "available": "Device location was supplied for this scan.",
        }.get(location_status, "Device location is unavailable."),
        "message": "No registered merchant matches this QR payee.",
    }
    if current_latitude is not None and current_longitude is not None:
        result["current_location"] = {"latitude": current_latitude, "longitude": current_longitude}
    if merchant is None:
        return result

    result["matched_merchant"] = {
        "shop_name": merchant["shop_name"],
        "upi_id": merchant["upi_id"],
        "upi_verification_status": merchant["upi_verification_status"],
    }
    result["registered_location"] = {
        "latitude": merchant["latitude"],
        "longitude": merchant["longitude"],
    }
    result["radius_m"] = merchant["radius_m"]

    if merchant["upi_verification_status"] != "verified":
        result.update(status="UPI_NOT_VERIFIED", message="The registered UPI ID has not been independently verified.")
        return result
    if location_status != "available" or current_latitude is None or current_longitude is None:
        status_messages = {
            "denied": ("LOCATION_PERMISSION_DENIED", "Location permission was denied; shop proximity could not be checked."),
            "unavailable": ("LOCATION_UNAVAILABLE", "Device location is unavailable; shop proximity could not be checked."),
        }
        status, message = status_messages.get(location_status, ("LOCATION_UNAVAILABLE", "Shop proximity could not be checked."))
        result.update(status=status, message=message)
        return result

    distance = haversine_distance_m(
        current_latitude,
        current_longitude,
        merchant["latitude"],
        merchant["longitude"],
    )
    accuracy = max(0.0, accuracy_m or 0.0)
    radius = float(merchant["radius_m"])
    result["distance_m"] = round(distance, 1)
    # Same/same-pin coordinates should not become uncertain solely because
    # the browser reports an accuracy circle larger than the shop radius.
    if distance <= 1.0:
        result.update(status="LOCATION_MATCH", message="The device location matches the registered merchant location.")
        return result
    # Mark outside only if even the nearest edge of the reported accuracy circle
    # lies beyond the configured merchant radius.
    if distance - accuracy > radius:
        result.update(status="LOCATION_MISMATCH", message="The device appears to be outside the merchant's configured location radius.")
    elif distance + accuracy <= radius:
        result.update(status="LOCATION_MATCH", message="The device location is within the merchant's configured radius, accounting for GPS accuracy.")
    else:
        result.update(status="LOCATION_UNCERTAIN", message="GPS accuracy overlaps the merchant radius, so proximity is uncertain.")
    return result
