import os
import cv2
import random
import numpy as np

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '../../data/synthetic_dataset')
os.makedirs(OUTPUT_DIR, exist_ok=True)

STATES = ['TN', 'KA', 'KL', 'AP', 'MH', 'DL', 'BH']
CHAR_SET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'

def generate_plate_text():
    state = random.choice(STATES)
    if state == 'BH':
        year = random.randint(20, 24)
        num = random.randint(1000, 9999)
        ser = random.choice(CHAR_SET) + random.choice(CHAR_SET)
        return f"{year}BH{num}{ser}"
    
    district = f"{random.randint(1, 99):02d}"
    series = random.choice(CHAR_SET) + (random.choice(CHAR_SET) if random.random() > 0.5 else "")
    num = f"{random.randint(1000, 9999)}"
    return f"{state}{district}{series}{num}"

def apply_augmentations(img: np.ndarray, tag: str) -> np.ndarray:
    h, w = img.shape[:2]
    out = img.copy()

    if tag == 'night' or tag == 'low_light':
        # Darken image
        out = (out.astype(np.float32) * 0.3).astype(np.uint8)
    elif tag == 'rain':
        # Add random streak lines
        for _ in range(50):
            x1 = random.randint(0, w)
            y1 = random.randint(0, h)
            cv2.line(out, (x1, y1), (x1 + 5, y1 + 15), (200, 200, 200), 1)
    elif tag == 'blur':
        # Motion blur
        kernel_size = 7
        kernel = np.zeros((kernel_size, kernel_size))
        kernel[int((kernel_size-1)/2), :] = np.ones(kernel_size)
        kernel /= kernel_size
        out = cv2.filter2D(out, -1, kernel)
    elif tag == 'angle':
        # Perspective shear
        pts1 = np.float32([[0,0],[w,0],[0,h],[w,h]])
        pts2 = np.float32([[10,5],[w-15,10],[5,h-5],[w-10,h-10]])
        M = cv2.getPerspectiveTransform(pts1, pts2)
        out = cv2.warpPerspective(out, M, (w, h))
    elif tag == 'dirty':
        # Dirt overlays
        for _ in range(30):
            cx = random.randint(0, w)
            cy = random.randint(0, h)
            r = random.randint(2, 8)
            cv2.circle(out, (cx, cy), r, (40, 40, 40), -1)

    return out

def create_synthetic_dataset(num_samples: int = 100):
    print(f"[Generator] Generating {num_samples} synthetic Indian license plates with augmentations...")
    labels = []
    tags = ['day', 'night', 'rain', 'blur', 'angle', 'dirty']

    for i in range(num_samples):
        plate_text = generate_plate_text()
        tag = random.choice(tags)

        # Create base yellow/white license plate canvas
        plate_w, plate_h = 300, 70
        is_yellow = random.random() > 0.6 # Commercial yellow plates in India
        bg_color = (0, 215, 255) if is_yellow else (240, 240, 240) # BGR
        
        img = np.full((plate_h, plate_w, 3), bg_color, dtype=np.uint8)
        
        # Draw black border
        cv2.rectangle(img, (2, 2), (plate_w-3, plate_h-3), (0, 0, 0), 3)

        # Draw plate text
        font = cv2.FONT_HERSHEY_SIMPLEX
        cv2.putText(img, plate_text, (20, 48), font, 1.3, (0, 0, 0), 3, cv2.LINE_AA)

        # Apply realistic environmental condition augmentations
        aug_img = apply_augmentations(img, tag)

        filename = f"sample_{i:03d}_{tag}.jpg"
        filepath = os.path.join(OUTPUT_DIR, filename)
        cv2.imwrite(filepath, aug_img)

        labels.append({
            "filename": filename,
            "groundTruth": plate_text,
            "tag": tag
        })

    import json
    labels_file = os.path.join(OUTPUT_DIR, "labels.json")
    with open(labels_file, "w") as f:
        json.dump(labels, f, indent=2)

    print(f"[Generator] Saved {num_samples} images & labels to {OUTPUT_DIR}")

if __name__ == "__main__":
    create_synthetic_dataset(120)
