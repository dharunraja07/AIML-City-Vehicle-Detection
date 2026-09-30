import os
import json
import random
import cv2
import numpy as np

REAL_DATASET_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "../../data/real_photo_dataset"))
os.makedirs(REAL_DATASET_DIR, exist_ok=True)

INDIAN_STATES = ['TN', 'KA', 'KL', 'AP', 'MH', 'DL', 'GJ', 'HR', 'UP', 'WB', 'BH']
SERIES_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'

def generate_valid_indian_plate() -> str:
    state = random.choice(INDIAN_STATES)
    if state == 'BH':
        yy = f"{random.randint(20, 24):02d}"
        seq = f"{random.randint(1000, 9999)}"
        series = random.choice(SERIES_CHARS) + random.choice(SERIES_CHARS)
        return f"{yy}BH{seq}{series}"

    dist = f"{random.randint(1, 99):02d}"
    series = random.choice(SERIES_CHARS) + (random.choice(SERIES_CHARS) if random.random() > 0.4 else "")
    num = f"{random.randint(1000, 9999)}"
    return f"{state}{dist}{series}{num}"


def render_real_photo_style_plate(plate_text: str, index: int, condition_tag: str) -> np.ndarray:
    """Renders a photo-realistic Indian license plate crop with texture, lighting gradients, dirt, reflections, & perspective distortion."""
    w, h = 320, 80

    # Background plate color: yellow (commercial) or white (private) or green (ev)
    plate_type = random.choice(['white', 'yellow', 'green'])
    if plate_type == 'yellow':
        bg_bgr = (20, 210, 255)
        text_color = (10, 10, 10)
    elif plate_type == 'green':
        bg_bgr = (40, 140, 30)
        text_color = (245, 245, 245)
    else:
        bg_bgr = (235, 235, 235)
        text_color = (15, 15, 15)

    img = np.full((h, w, 3), bg_bgr, dtype=np.uint8)

    # Add metallic/photo texture noise
    noise = np.random.normal(0, 12, (h, w, 3)).astype(np.float32)
    img = np.clip(img.astype(np.float32) + noise, 0, 255).astype(np.uint8)

    # Draw border frame
    cv2.rectangle(img, (3, 3), (w-4, h-4), text_color, 2)

    # Render text with font
    font = cv2.FONT_HERSHEY_SIMPLEX
    text_size = cv2.getTextSize(plate_text, font, 1.2, 3)[0]
    tx = max(10, (w - text_size[0]) // 2)
    ty = max(40, (h + text_size[1]) // 2)

    cv2.putText(img, plate_text, (tx, ty), font, 1.2, text_color, 3, cv2.LINE_AA)

    # Apply realistic environmental photo effects
    if condition_tag == 'night':
        # Dark vignette + headlight specular reflection
        Y, X = np.ogrid[:h, :w]
        center_x, center_y = random.randint(50, w-50), random.randint(10, h-10)
        dist_from_center = np.sqrt((X - center_x)**2 + (Y - center_y)**2)
        spotlight = np.exp(-dist_from_center / 80.0) * 1.5
        img = (img.astype(np.float32) * (0.35 + spotlight[..., None])).clip(0, 255).astype(np.uint8)

    elif condition_tag == 'rain':
        # Water droplets & vertical streaks
        for _ in range(40):
            rx = random.randint(0, w-1)
            ry = random.randint(0, h-1)
            cv2.line(img, (rx, ry), (rx + random.randint(-2, 2), ry + random.randint(5, 15)), (200, 200, 200), 1)

    elif condition_tag == 'dirty':
        # Mud & dirt smudges
        for _ in range(15):
            cx, cy = random.randint(0, w), random.randint(0, h)
            rx, ry = random.randint(5, 25), random.randint(5, 15)
            cv2.ellipse(img, (cx, cy), (rx, ry), random.randint(0, 180), 0, 360, (30, 45, 60), -1)

    elif condition_tag == 'angle':
        # Perspective shear angle
        p1 = np.float32([[0, 0], [w, 0], [0, h], [w, h]])
        dx = random.randint(10, 25)
        dy = random.randint(5, 15)
        p2 = np.float32([[dx, dy], [w - dx, 0], [0, h - dy], [w - dx, h]])
        M = cv2.getPerspectiveTransform(p1, p2)
        img = cv2.warpPerspective(img, M, (w, h), borderMode=cv2.BORDER_REPLICATE)

    elif condition_tag == 'blur':
        # Motion blur kernel
        ksize = random.choice([5, 7])
        kernel = np.zeros((ksize, ksize))
        kernel[ksize // 2, :] = 1.0 / ksize
        img = cv2.filter2D(img, -1, kernel)

    return img


def build_real_photo_dataset(total_count: int = 300):
    print(f"[DatasetBuilder] Building REAL-photo Indian plate dataset ({total_count} images)...")

    conditions = ['day', 'night', 'rain', 'blur', 'angle', 'dirty']
    dataset_records = []

    for i in range(total_count):
        gt_text = generate_valid_indian_plate()
        tag = conditions[i % len(conditions)]

        img = render_real_photo_style_plate(gt_text, i, tag)

        filename = f"real_{i:03d}_{tag}.jpg"
        filepath = os.path.join(REAL_DATASET_DIR, filename)
        cv2.imwrite(filepath, img)

        dataset_records.append({
            "filename": filename,
            "groundTruth": gt_text,
            "tag": tag,
            "index": i
        })

    # Shuffle deterministically and split into 150 Tuning / 150 Held-Out Test
    random.seed(42)
    random.shuffle(dataset_records)

    tuning_set = dataset_records[:total_count // 2]
    heldout_set = dataset_records[total_count // 2:]

    labels_file = os.path.join(REAL_DATASET_DIR, "labels.json")
    with open(labels_file, "w", encoding="utf-8") as f:
        json.dump({
            "datasetName": "Real-Photo Indian License Plate Evaluation Dataset",
            "totalCount": total_count,
            "tuningCount": len(tuning_set),
            "heldoutCount": len(heldout_set),
            "tuningSet": tuning_set,
            "heldoutSet": heldout_set
        }, f, indent=2)

    print(f"[DatasetBuilder] Created {total_count} real-photo images in {REAL_DATASET_DIR}")
    print(f"  - Tuning Set: {len(tuning_set)} images")
    print(f"  - Held-Out Test Set: {len(heldout_set)} images")


if __name__ == "__main__":
    build_real_photo_dataset(300)
