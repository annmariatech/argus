
import cv2
import numpy as np


def unavailable(message):
    return {
        "tamper_score": None,
        "tamper_reasons": [message]
    }


def detect_boundary_edges(image, corners):
    """Measure edge activity along the QR boundary."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 80, 160)

    points = np.asarray(corners, dtype=np.int32).reshape(4, 2)

    mask = np.zeros(gray.shape, dtype=np.uint8)
    cv2.polylines(mask, [points], True, 255, thickness=4)

    boundary_pixels = edges[mask > 0]

    if boundary_pixels.size == 0:
        return None

    return float(np.mean(boundary_pixels > 0))


def estimate_boundary_roughness(image, corners):
    """Score how ragged or torn the QR boundary appears."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 60, 140)
    points = np.asarray(corners, dtype=np.float32).reshape(4, 2)

    mask = np.zeros(gray.shape, dtype=np.uint8)
    cv2.polylines(mask, [points.astype(np.int32)], True, 255, thickness=3)

    boundary_pixels = edges[mask > 0]
    if boundary_pixels.size == 0:
        return 0.0

    edge_density = float(np.mean(boundary_pixels > 0))
    local_variance = float(np.var(boundary_pixels.astype(np.float32)))
    roughness = edge_density + min(local_variance / 2000.0, 0.6)
    return min(roughness, 1.5)


def estimate_contour_irregularity(image, corners):
    """Measure how irregular the QR boundary contour is, including torn edges."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    points = np.asarray(corners, dtype=np.int32).reshape(4, 2)

    mask = np.zeros(gray.shape, dtype=np.uint8)
    cv2.fillPoly(mask, [points], 255)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not contours:
        return 1.0

    contour = max(contours, key=cv2.contourArea)
    area = cv2.contourArea(contour)
    if area <= 0:
        return 1.0

    perimeter = cv2.arcLength(contour, True)
    return float((perimeter ** 2) / (4 * np.pi * area))


def detect_corner_abuse(image, corners):
    """Flag chipped or abused corners, which are stronger clues than a mild tilt."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    points = np.asarray(corners, dtype=np.float32).reshape(4, 2)

    side_lengths = [
        np.linalg.norm(points[(i + 1) % 4] - points[i])
        for i in range(4)
    ]
    base_size = max(np.median(side_lengths), 1.0)

    wear_scores = []

    for i in range(4):
        corner = points[i].astype(np.int32)
        half = max(int(base_size * 0.22), 8)
        x0 = max(0, corner[0] - half)
        y0 = max(0, corner[1] - half)
        x1 = min(gray.shape[1], corner[0] + half)
        y1 = min(gray.shape[0], corner[1] + half)

        patch = gray[y0:y1, x0:x1]
        if patch.size == 0:
            wear_scores.append(0.0)
            continue

        grad_x = cv2.Sobel(patch, cv2.CV_32F, 1, 0, ksize=3)
        grad_y = cv2.Sobel(patch, cv2.CV_32F, 0, 1, ksize=3)
        magnitude = np.sqrt(grad_x ** 2 + grad_y ** 2)
        edge_density = float(np.mean(magnitude > 20))
        local_std = float(np.std(patch))
        corner_score = edge_density * 0.7 + min(local_std / 65.0, 1.0) * 0.3
        wear_scores.append(corner_score)

    return float(np.mean(wear_scores))


def compare_boundary_texture(image, corners):
    """Compare grayscale variation inside and outside the QR region."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    points = np.asarray(corners, dtype=np.float32).reshape(4, 2)

    qr_mask = np.zeros(gray.shape, dtype=np.uint8)
    cv2.fillPoly(qr_mask, [points.astype(np.int32)], 255)

    center = np.mean(points, axis=0)
    outer_points = (
        center + (points - center) * 1.12
    ).astype(np.int32)

    outer_mask = np.zeros(gray.shape, dtype=np.uint8)
    cv2.fillPoly(outer_mask, [outer_points], 255)

    surrounding_mask = cv2.subtract(outer_mask, qr_mask)

    inside = gray[qr_mask > 0]
    outside = gray[surrounding_mask > 0]

    if inside.size == 0 or outside.size == 0:
        return None

    inside_texture = float(np.std(inside))
    outside_texture = float(np.std(outside))

    return {
        "inside_texture": inside_texture,
        "outside_texture": outside_texture,
        "texture_difference": abs(
            inside_texture - outside_texture
        )
    }


def analyze_tampering(image, qr_corners):
    """Return a heuristic tamper score and explanatory reasons."""

    if image is None:
        return unavailable("Tamper analysis unavailable: image could not be loaded.")

    if qr_corners is None:
        return unavailable("Tamper analysis unavailable: QR boundary was not detected.")

    try:
        points = np.asarray(
            qr_corners, dtype=np.float32
        ).reshape(4, 2)
    except (ValueError, TypeError):
        return unavailable("Tamper analysis unavailable: invalid QR boundary coordinates.")

    if not np.isfinite(points).all():
        return unavailable("Tamper analysis unavailable: boundary coordinates are invalid.")

    height, width = image.shape[:2]

    if (
        np.any(points[:, 0] < 0)
        or np.any(points[:, 0] >= width)
        or np.any(points[:, 1] < 0)
        or np.any(points[:, 1] >= height)
    ):
        return unavailable("Tamper analysis unavailable: QR boundary lies outside the image.")

    sides = []

    for i in range(4):
        following = points[(i + 1) % 4]
        sides.append(float(np.linalg.norm(following - points[i])))

    if min(sides) < 5:
        return unavailable("Tamper analysis unavailable: QR boundary is too small.")

    top_bottom_difference = (
        abs(sides[0] - sides[2])
        / max((sides[0] + sides[2]) / 2, 1)
    )

    left_right_difference = (
        abs(sides[1] - sides[3])
        / max((sides[1] + sides[3]) / 2, 1)
    )

    side_imbalance = max(
        top_bottom_difference, left_right_difference
    )

    angles = []

    for i in range(4):
        previous = points[(i - 1) % 4] - points[i]
        following = points[(i + 1) % 4] - points[i]

        denominator = (
            np.linalg.norm(previous) * np.linalg.norm(following)
        )

        if denominator == 0:
            return unavailable("Tamper analysis unavailable: invalid corner geometry.")

        cosine = np.dot(previous, following) / denominator
        cosine = np.clip(cosine, -1, 1)

        angles.append(float(np.degrees(np.arccos(cosine))))

    angle_deviation = max(
        abs(angle - 90) for angle in angles
    )

    edge_score = detect_boundary_edges(image, points)
    roughness_score = estimate_boundary_roughness(image, points)
    contour_irregularity = estimate_contour_irregularity(image, points)
    corner_abuse_score = detect_corner_abuse(image, points)
    texture_result = compare_boundary_texture(image, points)

    if edge_score is None or texture_result is None:
        return unavailable("Tamper analysis unavailable: image measurements could not be calculated.")

    texture_difference = texture_result["texture_difference"]

    geometry_component = (
        min(side_imbalance / 0.18, 1.0) * 4
        + min(angle_deviation / 25.0, 1.0) * 4
    )

    irregularity_component = 0.0
    if contour_irregularity > 1.35:
        irregularity_component = 25.0

    roughness_component = 0.0
    if roughness_score > 0.85 and (contour_irregularity > 1.35 or corner_abuse_score > 0.60 or texture_difference > 45):
        roughness_component = 18.0
    elif roughness_score > 0.72 and (contour_irregularity > 1.35 or corner_abuse_score > 0.60 or texture_difference > 45):
        roughness_component = 10.0

    edge_component = 0.0
    if edge_score > 0.25 and (contour_irregularity > 1.35 or corner_abuse_score > 0.60 or texture_difference > 45):
        edge_component = 8.0

    corner_component = 0.0
    if corner_abuse_score > 0.65:
        corner_component = 25.0
    elif corner_abuse_score > 0.50:
        corner_component = 15.0
    elif corner_abuse_score > 0.40:
        corner_component = 8.0

    texture_component = 0.0
    if texture_difference > 60:
        texture_component = 18.0 + min((texture_difference - 60.0) / 30.0, 1.0) * 18.0
    elif texture_difference > 45:
        texture_component = 12.0

    if (
        texture_difference < 20
        and corner_abuse_score < 0.40
        and edge_score < 0.12
        and roughness_score < 0.75
    ):
        score = 5
        reasons = [
            "The QR border shows mostly geometric perspective distortion without torn edges, strong corner damage, or a texture mismatch.",
            "This is treated as mild camera/angle distortion rather than tampering."
        ]
        reasons.append(
            f"Measurements: edge={edge_score:.3f}, roughness={roughness_score:.3f}, "
            f"contour_irregularity={contour_irregularity:.3f}, corner_abuse={corner_abuse_score:.3f}, "
            f"texture_difference={texture_difference:.2f}, side_imbalance={side_imbalance:.3f}, "
            f"angle_deviation={angle_deviation:.1f} degrees."
        )
        return {
            "tamper_score": int(score),
            "tamper_reasons": reasons
        }

    score = round(min(
        100,
        5 + geometry_component + irregularity_component + roughness_component + edge_component + corner_component + texture_component
    ))

    reasons = []

    if side_imbalance > 0.12:
        reasons.append("Opposite QR boundary sides differ noticeably.")

    if angle_deviation > 15:
        reasons.append("QR boundary has uneven or distorted corner angles.")

    if contour_irregularity > 1.35:
        reasons.append("QR boundary contour is more irregular than a clean printed square.")

    if roughness_score > 0.70:
        reasons.append("QR boundary shows ragged or torn-edge characteristics.")

    if edge_score > 0.20:
        reasons.append("There is strong edge activity near the QR border.")

    if corner_abuse_score > 0.45:
        reasons.append("The QR corners show abnormal local edge activity consistent with wear or tampering.")

    if texture_difference > 45:
        reasons.append(
            "Large texture mismatch between the QR region and its surrounding area."
        )

    if not reasons:
        reasons.append(
            "No strong QR-boundary, ragged-edge, or texture mismatch signals were found."
        )

    reasons.append(
        f"Measurements: edge={edge_score:.3f}, roughness={roughness_score:.3f}, "
        f"contour_irregularity={contour_irregularity:.3f}, corner_abuse={corner_abuse_score:.3f}, "
        f"texture_difference={texture_difference:.2f}, side_imbalance={side_imbalance:.3f}, "
        f"angle_deviation={angle_deviation:.1f} degrees."
    )

    reasons.append(
        "The score rises when the QR sticker shows torn edges, corner wear, or a border that is irregular enough to suggest tampering rather than a mild perspective tilt alone."
    )

    return {
        "tamper_score": int(score),
        "tamper_reasons": reasons
    }
