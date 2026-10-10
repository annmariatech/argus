
import cv2
from pathlib import Path

image_folder = Path("test_images")

for filename in ["qr.png", "qr2.png", "qr3.png"]:
    image_path = image_folder / filename
    image = cv2.imread(str(image_path))

    print(f"\n--- {filename} ---")

    if image is None:
        print("Could not load image.")
        continue

    height, width = image.shape[:2]
    print(f"Dimensions: {width} x {height}")
    print(f"File size: {image_path.stat().st_size} bytes")

    detector = cv2.QRCodeDetector()
    data, points, _ = detector.detectAndDecode(image)

    if points is not None:
        print("QR detected: Yes")
        print("QR decoded:", bool(data))
        print("QR boundary points:")
        print(points.reshape(-1, 2).astype(int).tolist())
    else:
        print("QR detected: No")
