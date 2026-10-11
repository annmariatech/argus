import unittest
from unittest.mock import patch

import numpy as np

from qr_verify import Payee, build_verdict
from risk_features import TAMPER_MEASUREMENT_FIELDS, compare_payee_name, extract_risk_features
from tamper_detector import analyze_tampering


COMPLETE_TAMPER_RESULT = {
    "tamper_score": 12,
    "tamper_reasons": ["No strong alteration signals."],
    "side_imbalance": 0.02,
    "angle_deviation": 3.5,
    "edge_score": 0.11,
    "roughness_score": 0.42,
    "contour_irregularity": 1.08,
    "corner_abuse_score": 0.2,
    "texture_difference": 14.0,
}


class RiskFeatureTests(unittest.TestCase):
    def test_name_comparison_is_word_order_independent(self):
        comparison = compare_payee_name("Maria Ann", "Ann Maria")
        self.assertEqual(comparison["name_match"], 1)

    def test_name_comparison_preserves_malayalam_letters(self):
        comparison = compare_payee_name("ഗ്രീൻ മാർട്ട്", "ഗ്രീൻ മാർട്ട്")
        self.assertEqual(comparison["name_match"], 1)
        self.assertEqual(comparison["payee_name_missing"], 0)

    def test_normal_scan_has_consistent_numeric_features(self):
        features = extract_risk_features(
            Payee("Green Mart", "shop@okbank"), "Green Mart", COMPLETE_TAMPER_RESULT
        )

        self.assertEqual(features["name_match"], 1)
        self.assertEqual(features["name_mismatch"], 0)
        self.assertEqual(features["vpa_missing"], 0)
        self.assertEqual(features["tamper_score"], 12.0)
        for field in TAMPER_MEASUREMENT_FIELDS:
            self.assertEqual(features[field], float(COMPLETE_TAMPER_RESULT[field]))
            self.assertEqual(features[f"{field}_missing"], 0)

    def test_name_mismatch_feature_agrees_with_verdict_comparison(self):
        payee = Payee("Other Shop", "other@okbank")
        features = extract_risk_features(payee, "Green Mart", COMPLETE_TAMPER_RESULT)
        verdict = build_verdict(payee, "Green Mart", 12)

        self.assertEqual(features["name_mismatch"], 1)
        self.assertIn("NAME_MISMATCH", [reason["code"] for reason in verdict["reasons"]])

    def test_missing_payee_data_is_explicit(self):
        features = extract_risk_features({"name": None, "vpa": None}, "Green Mart", COMPLETE_TAMPER_RESULT)
        self.assertEqual(features["payee_name_missing"], 1)
        self.assertEqual(features["payee_name_similarity_missing"], 1)
        self.assertIsNone(features["payee_name_similarity"])
        self.assertEqual(features["vpa_missing"], 1)

    def test_unavailable_tamper_analysis_keeps_measurements_missing(self):
        unavailable = {"tamper_score": None, "tamper_reasons": ["Boundary not detected."]}
        features = extract_risk_features(Payee("Green Mart", None), "Green Mart", unavailable)

        self.assertEqual(features["tamper_analysis_missing"], 1)
        self.assertEqual(features["tamper_score_missing"], 1)
        for field in TAMPER_MEASUREMENT_FIELDS:
            self.assertIsNone(features[field])
            self.assertEqual(features[f"{field}_missing"], 1)

    def test_tamper_detector_exposes_measurements_and_nullable_fields(self):
        image = np.zeros((100, 100, 3), dtype=np.uint8)
        corners = np.array([[[10, 10], [90, 10], [90, 90], [10, 90]]], dtype=np.float32)
        with (
            patch("tamper_detector.detect_boundary_edges", return_value=0.1),
            patch("tamper_detector.estimate_boundary_roughness", return_value=0.3),
            patch("tamper_detector.estimate_contour_irregularity", return_value=1.0),
            patch("tamper_detector.detect_corner_abuse", return_value=0.2),
            patch("tamper_detector.compare_boundary_texture", return_value={"texture_difference": 10.0}),
        ):
            result = analyze_tampering(image, corners)

        self.assertIsNotNone(result["tamper_score"])
        self.assertTrue(all(field in result for field in TAMPER_MEASUREMENT_FIELDS))
        self.assertTrue(all(result[field] is not None for field in TAMPER_MEASUREMENT_FIELDS))

        unavailable = analyze_tampering(image, None)
        self.assertIsNone(unavailable["tamper_score"])
        self.assertTrue(all(field in unavailable for field in TAMPER_MEASUREMENT_FIELDS))
        self.assertTrue(all(unavailable[field] is None for field in TAMPER_MEASUREMENT_FIELDS))

    def test_tamper_detector_does_not_flag_texture_difference_alone(self):
        image = np.zeros((100, 100, 3), dtype=np.uint8)
        corners = np.array([[[10, 10], [90, 10], [90, 90], [10, 90]]], dtype=np.float32)
        with (
            patch("tamper_detector.detect_boundary_edges", return_value=0.15),
            patch("tamper_detector.estimate_boundary_roughness", return_value=0.5),
            patch("tamper_detector.estimate_contour_irregularity", return_value=1.5),
            patch("tamper_detector.detect_corner_abuse", return_value=0.9),
            patch("tamper_detector.compare_boundary_texture", return_value={"texture_difference": 90.0}),
        ):
            result = analyze_tampering(image, corners)

        self.assertEqual(result["tamper_score"], 5)
        self.assertNotIn("possible alteration signal", " ".join(result["tamper_reasons"]))

    def test_tamper_detector_keeps_analysis_available_when_texture_is_unavailable(self):
        image = np.zeros((100, 100, 3), dtype=np.uint8)
        corners = np.array([[[10, 10], [90, 10], [90, 90], [10, 90]]], dtype=np.float32)
        with (
            patch("tamper_detector.detect_boundary_edges", return_value=0.15),
            patch("tamper_detector.estimate_boundary_roughness", return_value=0.5),
            patch("tamper_detector.estimate_contour_irregularity", return_value=1.1),
            patch("tamper_detector.detect_corner_abuse", return_value=0.2),
            patch("tamper_detector.compare_boundary_texture", return_value=None),
        ):
            result = analyze_tampering(image, corners)

        self.assertIsNotNone(result["tamper_score"])
        self.assertIsNone(result["texture_difference"])

    def test_invalid_measurement_values_are_rejected(self):
        invalid = {**COMPLETE_TAMPER_RESULT, "edge_score": float("nan")}
        with self.assertRaisesRegex(ValueError, "edge_score must be finite"):
            extract_risk_features(Payee("Green Mart", "shop@okbank"), "Green Mart", invalid)


if __name__ == "__main__":
    unittest.main()
