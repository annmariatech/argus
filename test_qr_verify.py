import asyncio
from io import BytesIO
import unittest
from unittest.mock import patch

from qr_verify import Payee, build_verdict, extract_upi_payee
from fastapi import HTTPException, UploadFile
from main import scan_qr


class ExtractUpiPayeeTests(unittest.TestCase):
    def test_extracts_name_and_vpa(self):
        payee = extract_upi_payee("upi://pay?pa=shop%40okbank&pn=Green%20Mart&am=25")
        self.assertEqual(payee, Payee(name="Green Mart", vpa="shop@okbank"))

    def test_rejects_non_upi_payload(self):
        with self.assertRaises(ValueError):
            extract_upi_payee("https://example.com/pay")

    def test_invalid_vpa_is_not_returned(self):
        payee = extract_upi_payee("upi://pay?pa=not-a-vpa&pn=Shop")
        self.assertIsNone(payee.vpa)


class BuildVerdictTests(unittest.TestCase):
    def test_matching_payee_and_low_tamper_is_safe(self):
        result = build_verdict(Payee("Green Mart", "shop@okbank"), "Green Mart", 5)
        self.assertEqual(result["verdict"], "SAFE")
        self.assertEqual(result["risk_score"], 3)
        self.assertEqual(result["payee"], {"name": "Green Mart", "vpa": "shop@okbank"})

    def test_mismatch_and_high_tamper_is_danger(self):
        result = build_verdict(Payee("Other Shop", "other@okbank"), "Green Mart", 80)
        self.assertEqual(result["verdict"], "DANGER")
        self.assertIn("NAME_MISMATCH", [reason["code"] for reason in result["reasons"]])
        self.assertIn("TAMPER_HIGH", [reason["code"] for reason in result["reasons"]])

    def test_missing_signals_never_claim_safe(self):
        result = build_verdict(Payee(None, None), None)
        self.assertEqual(result["verdict"], "SUSPICIOUS")
        self.assertIn("TAMPER_UNAVAILABLE", [reason["code"] for reason in result["reasons"]])


class ScanApiTests(unittest.TestCase):
    @patch("main.decode_qr_bytes", return_value="upi://pay?pa=shop%40okbank&pn=Green%20Mart")
    def test_accepts_multipart_file_and_merchant_name(self, _decode):
        result = asyncio.run(
            scan_qr(
                file=UploadFile(filename="qr.png", file=BytesIO(b"image bytes")),
                merchant_name="Green Mart",
            )
        )
        self.assertEqual(result["payee"], {"name": "Green Mart", "vpa": "shop@okbank"})
        self.assertEqual(result["merchant_name"], "Green Mart")
        self.assertEqual(
            set(result),
            {"verdict", "risk_score", "payee", "merchant_name", "reasons", "disclaimer"},
        )

    @patch("main.decode_qr_bytes", side_effect=ValueError("No readable QR code was found in the image"))
    def test_returns_clear_error_for_unreadable_qr(self, _decode):
        with self.assertRaises(HTTPException) as caught:
            asyncio.run(
                scan_qr(
                    file=UploadFile(filename="qr.png", file=BytesIO(b"not a qr")),
                    merchant_name="Green Mart",
                )
            )
        self.assertEqual(caught.exception.status_code, 400)
        self.assertIn("No readable QR", caught.exception.detail)


if __name__ == "__main__":
    unittest.main()
