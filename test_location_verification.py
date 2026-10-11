import unittest

from location_verification import haversine_distance_m, verify_location


VERIFIED_MERCHANT = {
    "shop_name": "Green Mart",
    "upi_id": "shop@okbank",
    "upi_verification_status": "verified",
    "latitude": 12.9716,
    "longitude": 77.5946,
    "radius_m": 150,
}


class HaversineTests(unittest.TestCase):
    def test_same_coordinate_is_zero_distance(self):
        self.assertEqual(haversine_distance_m(12.9, 77.5, 12.9, 77.5), 0)

    def test_distance_is_measured_in_metres(self):
        distance = haversine_distance_m(0, 0, 0, 0.001)
        self.assertGreater(distance, 100)
        self.assertLess(distance, 120)


class LocationVerificationTests(unittest.TestCase):
    def test_nearby_scan_accounts_for_gps_accuracy(self):
        result = verify_location("shop@okbank", 12.9716, 77.5946, 30, "available", VERIFIED_MERCHANT)
        self.assertEqual(result["status"], "LOCATION_MATCH")
        self.assertEqual(result["distance_m"], 0)

    def test_outside_radius_is_a_mismatch_after_accuracy_margin(self):
        result = verify_location("shop@okbank", 12.98, 77.5946, 20, "available", VERIFIED_MERCHANT)
        self.assertEqual(result["status"], "LOCATION_MISMATCH")

    def test_accuracy_overlap_is_uncertain(self):
        result = verify_location("shop@okbank", 12.9729, 77.5946, 30, "available", VERIFIED_MERCHANT)
        self.assertEqual(result["status"], "LOCATION_UNCERTAIN")

    def test_same_registered_coordinates_are_certain_despite_large_accuracy_radius(self):
        merchant = {**VERIFIED_MERCHANT, "radius_m": 25}
        result = verify_location("shop@okbank", 12.9716, 77.5946, 100, "available", merchant)
        self.assertEqual(result["status"], "LOCATION_MATCH")
        self.assertEqual(result["distance_m"], 0)

    def test_permission_denial_is_reported_without_coordinates(self):
        result = verify_location("shop@okbank", None, None, None, "denied", VERIFIED_MERCHANT)
        self.assertEqual(result["status"], "LOCATION_PERMISSION_DENIED")
        self.assertEqual(result["device_location_status"], "denied")
        self.assertIsNone(result["current_location"])

    def test_unknown_payee_has_no_matched_merchant(self):
        result = verify_location("unknown@bank", None, None, None, "unavailable", None)
        self.assertEqual(result["status"], "UNKNOWN_MERCHANT")
        self.assertIsNone(result["matched_merchant"])

    def test_unverified_upi_is_not_treated_as_location_match(self):
        merchant = {**VERIFIED_MERCHANT, "upi_verification_status": "pending"}
        result = verify_location("shop@okbank", 12.9716, 77.5946, 5, "available", merchant)
        self.assertEqual(result["status"], "UPI_NOT_VERIFIED")
        self.assertIsNone(result["distance_m"])


if __name__ == "__main__":
    unittest.main()
