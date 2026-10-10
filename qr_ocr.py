
import cv2
import easyocr
import json
import argparse
import numpy as np
from pathlib import Path
from tamper_detector import analyze_tampering

# Load the OCR model only once
_reader = None


def get_ocr_reader():
    global _reader

    if _reader is None:
        print("Loading OCR model... please wait.")
        _reader = easyocr.Reader(["en"], gpu=False)

    return _reader


def decode_qr_adaptive(image):
    detector = cv2.QRCodeDetector()

    height, width = image.shape[:2]
    best_points = None

    # Try original size first, then progressively larger sizes
    for scale in (1, 1.5, 2, 3, 4):
        new_width = int(width * scale)
        new_height = int(height * scale)

        # Prevent excessively large images
        if new_width > 3000 or new_height > 3000:
            continue

        # Resize only when necessary
        if scale == 1:
            resized = image
        else:
            resized = cv2.resize(
                image,
                (new_width, new_height),
                interpolation=cv2.INTER_CUBIC
            )

        # Try different versions of the image
        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)

        adaptive = cv2.adaptiveThreshold(
            gray,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            31,
            5
        )

        variants = [resized, gray, adaptive]

        # Try decoding each version
        for variant in variants:
            data, points, _ = detector.detectAndDecode(variant)

            # Convert QR corners back to original image coordinates
            if points is not None:
                original_points = points / scale
                best_points = original_points

            # Return immediately when decoding succeeds
            if data:
                return data, (
                    points / scale if points is not None
                    else best_points
                )

    # All attempts finished; keep any detected corners
    return "", best_points


def analyze_image(image_path, evidence_path="output/evidence.jpg"):
    # 1. Load the image
    image = cv2.imread(str(image_path))

    if image is None:
        raise ValueError(f"Could not open image: {image_path}")

    evidence = image.copy()

    # 2. Detect and decode the QR code
    qr_data, points = decode_qr_adaptive(image)

    qr_detected = points is not None or bool(qr_data)
    tamper_result = analyze_tampering(image, points)
    qr_corners = []

    if points is not None:
        corners = points.reshape(-1, 2).astype(int)
        qr_corners = corners.tolist()

        # Draw a green boundary around the QR code
        cv2.polylines(
            evidence,
            [corners],
            True,
            (0, 255, 0),
            3
        )

        cv2.putText(
            evidence,
            "QR CODE",
            tuple(corners[0]),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (0, 255, 0),
            2
        )

    # 3. Extract visible text using OCR
    reader = get_ocr_reader()
    
    # Enlarge small images before OCR
    height, width = image.shape[:2]
    scale = 1

    if max(height, width) < 1000:
        scale = min(3, 1000 / max(height, width))

    if scale > 1:
        ocr_image = cv2.resize(
            image,
            (int(width * scale), int(height * scale)),
            interpolation=cv2.INTER_CUBIC
        )
    else:
        ocr_image = image

    results = reader.readtext(ocr_image)


    ocr_items = []

    for box, text, confidence in results:
        polygon = [
            [int(point[0]), int(point[1])]
            for point in box
        ]

        ocr_items.append({
            "text": text,
            "confidence": round(float(confidence), 3),
            "box": polygon
        })

        # Draw a blue boundary around detected text
        cv2.polylines(
            evidence,
            [np.array(polygon, dtype=np.int32)],
            True,
            (255, 0, 0),
            2
        )

    # 4. Save the evidence image
    evidence_file = Path(evidence_path)
    evidence_file.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    if not cv2.imwrite(str(evidence_file), evidence):
        raise ValueError("Could not save evidence image.")

    # 5. Return results for the verification module
    return {
        "qr_detected": qr_detected,
        "qr_decoded": bool(qr_data),
        "qr_data": qr_data,
        "qr_corners": qr_corners,
        "ocr_text": " ".join(
            item["text"] for item in ocr_items
        ),
        "ocr_items": ocr_items,
        "evidence_image": str(evidence_file),
        "tamper_score": tamper_result["tamper_score"],
        "tamper_reasons": tamper_result["tamper_reasons"],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="QR scanning and OCR analysis"
    )

    parser.add_argument(
        "image",
        help="Path to the input image"
    )

    args = parser.parse_args()

    try:
        result = analyze_image(args.image)
        print(json.dumps({
            "tamper_score": result.get("tamper_score"),
            "tamper_reasons": result.get("tamper_reasons", []),
            "ocr_text": result.get("ocr_text", "")
        }, indent=4))

    except (ValueError, cv2.error) as error:
        print(f"Error: {error}")
