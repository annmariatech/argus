"""Validated, model-ready numeric features for the Argus heuristic pipeline.

This module only extracts inputs. It does not make predictions or train a
classifier. Missing values remain ``None`` and have explicit indicator fields.
"""

from __future__ import annotations

from collections.abc import Mapping
from difflib import SequenceMatcher
import math
import re
from typing import Any


TAMPER_MEASUREMENT_FIELDS = (
    "side_imbalance",
    "angle_deviation",
    "edge_score",
    "roughness_score",
    "contour_irregularity",
    "corner_abuse_score",
    "texture_difference",
)


def compare_payee_name(payee_name: str | None, merchant_name: str | None) -> dict[str, Any]:
    """Return the normalized name comparison used by both features and verdict."""
    payee_normalized = _normalize_name(payee_name)
    merchant_normalized = _normalize_name(merchant_name)
    similarity = (
        SequenceMatcher(None, payee_normalized, merchant_normalized).ratio()
        if payee_normalized and merchant_normalized
        else None
    )

    return {
        "payee_name_similarity": similarity,
        "payee_name_similarity_missing": int(similarity is None),
        "payee_name_missing": int(not payee_normalized),
        "merchant_name_missing": int(not merchant_normalized),
        "name_match": int(similarity is not None and similarity >= 0.86),
        "name_partial_match": int(similarity is not None and 0.62 <= similarity < 0.86),
        "name_mismatch": int(similarity is not None and similarity < 0.62),
    }


def extract_risk_features(
    payee: Any,
    merchant_name: str | None,
    tamper_result: Mapping[str, Any] | None,
) -> dict[str, float | int | None]:
    """Create a stable, validated numeric feature dictionary from scan results.

    `payee` may be an object with `name`/`vpa` attributes or a mapping with
    those keys. Tamper measurement fields and the score may be absent or None;
    each such value stays None and gets a corresponding ``*_missing`` flag.
    Non-finite values, wrong types, and out-of-range bounded measurements are
    rejected instead of silently clipped or replaced.
    """
    payee_name = _payee_field(payee, "name")
    vpa = _payee_field(payee, "vpa")
    comparison = compare_payee_name(payee_name, merchant_name)

    score = _numeric_value(tamper_result, "tamper_score", minimum=0, maximum=100)
    features: dict[str, float | int | None] = {
        **comparison,
        "vpa_missing": int(not isinstance(vpa, str) or not vpa.strip()),
        "tamper_score": score,
        "tamper_score_missing": int(score is None),
        "tamper_analysis_missing": int(tamper_result is None or score is None),
    }

    for field in TAMPER_MEASUREMENT_FIELDS:
        maximum = {
            "angle_deviation": 90,
            "edge_score": 1,
            "roughness_score": 1.5,
            "corner_abuse_score": 1,
        }.get(field)
        value = _numeric_value(tamper_result, field, minimum=0, maximum=maximum)
        features[field] = value
        features[f"{field}_missing"] = int(value is None)

    return features


def _payee_field(payee: Any, field: str) -> Any:
    if isinstance(payee, Mapping):
        return payee.get(field)
    return getattr(payee, field, None)


def _numeric_value(
    result: Mapping[str, Any] | None,
    field: str,
    minimum: float,
    maximum: float | None = None,
) -> float | None:
    value = result.get(field) if result is not None else None
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{field} must be a finite number or None")
    number = float(value)
    if not math.isfinite(number):
        raise ValueError(f"{field} must be finite")
    if number < minimum or (maximum is not None and number > maximum):
        range_text = f"{minimum}..{maximum}" if maximum is not None else f">= {minimum}"
        raise ValueError(f"{field} must be in the range {range_text}")
    return number


def _normalize_name(value: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.casefold()).strip() if value else ""
