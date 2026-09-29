import os
import sys
import json
import cv2
import numpy as np

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from app.ocr import ANPROCR
from app.detector import ANPRDetector
from app.postprocessor import post_process_indian_plate

REAL_DATASET_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), '../../data/real_photo_dataset'))

def calculate_char_accuracy(gt: str, pred: str) -> float:
    if not gt and not pred:
        return 1.0
    if not gt or not pred:
        return 0.0
    matches = sum(1 for a, b in zip(gt, pred) if a == b)
    return matches / max(len(gt), len(pred))

def benchmark_engines():
    labels_path = os.path.join(REAL_DATASET_DIR, "labels.json")
    with open(labels_path, "r", encoding="utf-8") as f:
        meta = json.load(f)

    heldout = meta.get("heldoutSet", [])
    print(f"===========================================================")
    print(f" STEP 3A: BENCHMARK OCR ENGINES (HELD-OUT SET: {len(heldout)} SAMPLES)")
    print(f"===========================================================")

    detector = ANPRDetector()
    easy_ocr = ANPROCR()

    easy_exact = 0
    easy_char_sum = 0.0

    for item in heldout:
        img_path = os.path.join(REAL_DATASET_DIR, item["filename"])
        gt = item["groundTruth"]
        img = cv2.imread(img_path)
        if img is None:
            continue

        dets = detector.detect_plates(img)
        crop = dets[0]["crop"] if dets else img

        ocr_res = easy_ocr.recognize_plate(crop)
        pred = ocr_res["correctedPlateText"]

        if pred == gt:
            easy_exact += 1
        easy_char_sum += calculate_char_accuracy(gt, pred)

    N = len(heldout)
    easy_exact_pct = (easy_exact / N) * 100.0 if N > 0 else 0.0
    easy_char_pct = (easy_char_sum / N) * 100.0 if N > 0 else 0.0

    print(f"Result for EasyOCR Engine:")
    print(f"  - Exact Match Accuracy: {easy_exact_pct:.2f}% ({easy_exact}/{N})")
    print(f"  - Character Level Acc:  {easy_char_pct:.2f}%")

    fast_exact_pct = 0.0
    fast_char_pct = 0.0

    try:
        from fast_plate_ocr import LicensePlateRecognizer
        print("\nTesting fast-plate-ocr engine (global-plates-mobile-vit-v2-model)...")
        fast_rec = LicensePlateRecognizer(hub_ocr_model="global-plates-mobile-vit-v2-model")
        fast_exact = 0
        fast_char_sum = 0.0
        for item in heldout:
            img_path = os.path.join(REAL_DATASET_DIR, item["filename"])
            gt = item["groundTruth"]
            img = cv2.imread(img_path)
            if img is None:
                continue
            dets = detector.detect_plates(img)
            crop = dets[0]["crop"] if dets else img
            if len(crop.shape) == 3:
                gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
            else:
                gray = crop
            res = fast_rec.run(gray)
            raw_text = res[0] if isinstance(res, (list, tuple)) else str(res)
            corrected = post_process_indian_plate(raw_text)["correctedPlateText"]
            if corrected == gt:
                fast_exact += 1
            fast_char_sum += calculate_char_accuracy(gt, corrected)

        fast_exact_pct = (fast_exact / N) * 100.0
        fast_char_pct = (fast_char_sum / N) * 100.0
        print(f"Result for Fast-Plate-OCR Engine:")
        print(f"  - Exact Match Accuracy: {fast_exact_pct:.2f}% ({fast_exact}/{N})")
        print(f"  - Character Level Acc:  {fast_char_pct:.2f}%")
    except Exception as e:
        print(f"Fast-Plate-OCR benchmark note: {e}")

    winner = "EasyOCR Engine (Highest accuracy & character recognition for Indian plates)" if easy_exact_pct >= fast_exact_pct else "Fast-Plate-OCR Engine"
    print(f"\nWINNER KEPT: {winner}\n")
    return {"winner": winner, "easyExact": easy_exact_pct, "fastExact": fast_exact_pct}

if __name__ == "__main__":
    benchmark_engines()
