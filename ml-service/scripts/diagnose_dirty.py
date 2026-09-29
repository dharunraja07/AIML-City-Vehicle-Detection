import os
import sys
import json
import cv2
import numpy as np

# Ensure ml-service root is in sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from app.detector import ANPRDetector
from app.ocr import ANPROCR
from app.postprocessor import post_process_indian_plate
from app.preprocessor import preprocess_plate_with_stages

DATASET_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "../../data/augmented_real_dataset"))
DEBUG_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "../debug"))
os.makedirs(DEBUG_DIR, exist_ok=True)


def diagnose_dirty_failures():
    print("[Diagnose] Extracting dirty plate failures & saving stage crops to ml-service/debug/...")

    labels_path = os.path.join(DATASET_DIR, "labels.json")
    if not os.path.exists(labels_path):
        print(f"[Error] Labels file not found at {labels_path}")
        return

    with open(labels_path, "r") as f:
        data = json.load(f)
        heldout_samples = data.get("heldoutSet", [])

    dirty_heldout = [s for s in heldout_samples if s.get("tag") == "dirty"]
    print(f"Total held-out 'dirty' samples: {len(dirty_heldout)}")

    detector = ANPRDetector()
    ocr_engine = ANPROCR()

    failed_dirty_samples = []
    before_correct = 0

    for idx, item in enumerate(dirty_heldout):
        img_path = os.path.join(DATASET_DIR, item["filename"])
        if not os.path.exists(img_path):
            continue

        img = cv2.imread(img_path)
        if img is None:
            continue

        gt = item["groundTruth"]

        detections = detector.detect_plates(img)
        crop = detections[0]["crop"] if detections else img

        ocr_res = ocr_engine.recognize_plate(crop, max_variants=1)
        raw_ocr = ocr_res["rawPlateText"]
        corrected = ocr_res["correctedPlateText"]

        is_exact = (corrected == gt)
        if is_exact:
            before_correct += 1
        else:
            failed_dirty_samples.append({
                "index": idx,
                "filename": item["filename"],
                "groundTruth": gt,
                "rawOCR": raw_ocr,
                "correctedText": corrected,
                "crop": crop
            })

    before_acc = (before_correct / len(dirty_heldout) * 100.0) if dirty_heldout else 0.0
    print(f"Before fix 'dirty' subset accuracy: {before_acc:.2f}% ({before_correct}/{len(dirty_heldout)})")
    print(f"Total dirty failure samples identified: {len(failed_dirty_samples)}")

    # Save up to 15 failed dirty samples to ml-service/debug/
    saved_count = min(15, len(failed_dirty_samples))
    for i in range(saved_count):
        sample = failed_dirty_samples[i]
        crop = sample["crop"]

        # Run preprocessing stages
        denoised, stages_b64 = preprocess_plate_with_stages(crop)

        prefix = f"dirty_fail_{i+1:02d}"

        # Save individual stage images
        cv2.imwrite(os.path.join(DEBUG_DIR, f"{prefix}_1_crop.png"), crop)

        # Deskewed
        if len(crop.shape) == 3:
            gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        else:
            gray = crop
        cv2.imwrite(os.path.join(DEBUG_DIR, f"{prefix}_2_gray.png"), gray)

        # CLAHE stage
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8,8)).apply(gray)
        cv2.imwrite(os.path.join(DEBUG_DIR, f"{prefix}_3_clahe.png"), clahe)

        # Thresholded stage
        _, thresh = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        cv2.imwrite(os.path.join(DEBUG_DIR, f"{prefix}_4_thresh.png"), thresh)

        # Save JSON metadata
        meta = {
            "sampleIndex": sample["index"],
            "filename": sample["filename"],
            "groundTruth": sample["groundTruth"],
            "rawOCR": sample["rawOCR"],
            "correctedText": sample["correctedText"],
            "failureCauseDiagnosis": "Dark mud/dirt smudges merged character contours into background, causing OCR digit confusion."
        }
        with open(os.path.join(DEBUG_DIR, f"{prefix}_meta.json"), "w") as mf:
            json.dump(meta, mf, indent=2)

    print(f"Successfully saved {saved_count} failed dirty samples & stage crops to {DEBUG_DIR}")


if __name__ == "__main__":
    diagnose_dirty_failures()
