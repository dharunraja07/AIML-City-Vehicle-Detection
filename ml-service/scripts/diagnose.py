import os
import sys
import json
import cv2
import numpy as np
from collections import defaultdict
from typing import Tuple, List, Dict, Any

# Ensure UTF-8 output encoding for Windows stdout
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

# Add ml-service root to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from app.ocr import ANPROCR
from app.detector import ANPRDetector
from app.postprocessor import post_process_indian_plate

REAL_DATASET_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), '../../data/real_photo_dataset'))
DEBUG_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), '../debug'))
os.makedirs(DEBUG_DIR, exist_ok=True)


def calculate_char_accuracy(gt: str, pred: str) -> float:
    if not gt and not pred:
        return 1.0
    if not gt or not pred:
        return 0.0
    matches = sum(1 for a, b in zip(gt, pred) if a == b)
    return matches / max(len(gt), len(pred))


def run_diagnostics():
    labels_path = os.path.join(REAL_DATASET_DIR, "labels.json")
    if not os.path.exists(labels_path):
        print("[Diagnose] Dataset missing. Generating first...")
        from build_real_dataset import build_real_photo_dataset
        build_real_photo_dataset(300)

    with open(labels_path, "r", encoding="utf-8") as f:
        meta = json.load(f)

    heldout_samples = meta.get("heldoutSet", [])
    print(f"\n===========================================================")
    print(f" ANPR ENGINE DIAGNOSTICS (HELD-OUT TEST SET: {len(heldout_samples)} SAMPLES)")
    print(f"===========================================================\n")

    detector = ANPRDetector()
    ocr_engine = ANPROCR()

    exact_matches = 0
    total_char_acc = 0.0

    tag_stats = defaultdict(lambda: {"total": 0, "exact": 0, "char_acc_sum": 0.0})
    confusion = defaultdict(lambda: defaultdict(int))
    failure_causes = {"DETECTION_MISS": 0, "OCR_READ_ERROR": 0, "POSTPROCESSOR_PARSING_ERROR": 0}

    failed_samples = []

    for item in heldout_samples:
        filename = item["filename"]
        gt = item["groundTruth"]
        tag = item["tag"]

        img_path = os.path.join(REAL_DATASET_DIR, filename)
        if not os.path.exists(img_path):
            continue

        img = cv2.imread(img_path)
        if img is None:
            continue

        # Step A: Detection
        detections = detector.detect_plates(img)

        detection_failed = False
        if detections:
            crop = detections[0]["crop"]
        else:
            crop = img
            detection_failed = True

        # Step B: OCR Reading
        ocr_res = ocr_engine.recognize_plate(crop)
        raw_ocr = ocr_res["rawPlateText"]
        corrected = ocr_res["correctedPlateText"]

        is_exact = (corrected == gt)
        c_acc = calculate_char_accuracy(gt, corrected)

        if is_exact:
            exact_matches += 1
        else:
            if detection_failed:
                cause = "DETECTION_MISS"
            elif calculate_char_accuracy(gt, raw_ocr) < 0.5:
                cause = "OCR_READ_ERROR"
            else:
                cause = "POSTPROCESSOR_PARSING_ERROR"

            failure_causes[cause] += 1

            debug_path = os.path.join(DEBUG_DIR, f"fail_{filename}")
            cv2.imwrite(debug_path, crop)

            failed_samples.append({
                "filename": filename,
                "groundTruth": gt,
                "rawOCR": raw_ocr,
                "corrected": corrected,
                "tag": tag,
                "cause": cause,
                "debugCropPath": debug_path
            })

        total_char_acc += c_acc
        tag_stats[tag]["total"] += 1
        if is_exact:
            tag_stats[tag]["exact"] += 1
        tag_stats[tag]["char_acc_sum"] += c_acc

        for g_c, p_c in zip(gt, corrected):
            if g_c != p_c:
                confusion[g_c][p_c] += 1

    N = len(heldout_samples)
    exact_acc_pct = (exact_matches / N) * 100.0 if N > 0 else 0.0
    char_acc_pct = (total_char_acc / N) * 100.0 if N > 0 else 0.0

    print(f"Overall Held-Out Exact Match Accuracy: {exact_acc_pct:.2f}%")
    print(f"Overall Held-Out Character Accuracy:   {char_acc_pct:.2f}%\n")

    print("PER-CONDITION ACCURACY BREAKDOWN:")
    print("-" * 65)
    print(f"{'Condition Tag':<15} | {'Samples':<8} | {'Exact Acc (%)':<15} | {'Char Acc (%)':<15}")
    print("-" * 65)
    for tag, st in sorted(tag_stats.items()):
        ex = (st["exact"] / st["total"]) * 100.0 if st["total"] > 0 else 0.0
        ch = (st["char_acc_sum"] / st["total"]) * 100.0 if st["total"] > 0 else 0.0
        print(f"{tag:<15} | {st['total']:<8} | {ex:<15.2f} | {ch:<15.2f}")
    print("-" * 65)

    print("\nFAILURE ROOT CAUSES ANALYSIS:")
    print(f"  - Detection Misses (No/Wrong Box): {failure_causes['DETECTION_MISS']}")
    print(f"  - OCR Reading Errors (Visual Noise): {failure_causes['OCR_READ_ERROR']}")
    print(f"  - Postprocessor Parsing Errors:    {failure_causes['POSTPROCESSOR_PARSING_ERROR']}\n")

    print("TOP 10 OCR CHARACTER CONFUSIONS:")
    confusion_list = []
    for g, preds in confusion.items():
        for p, cnt in preds.items():
            confusion_list.append((g, p, cnt))
    confusion_list.sort(key=lambda x: x[2], reverse=True)
    for g, p, cnt in confusion_list[:10]:
        print(f"  GT '{g}' -> Predicted '{p}': {cnt} times")

    print(f"\nFIRST 20 FAILED SAMPLES (Crops saved to {DEBUG_DIR}):")
    print("=" * 85)
    print(f"{'Filename':<22} | {'Tag':<7} | {'Ground Truth':<12} | {'Raw OCR':<12} | {'Corrected':<12} | {'Root Cause':<15}")
    print("=" * 85)
    for s in failed_samples[:20]:
        print(f"{s['filename']:<22} | {s['tag']:<7} | {s['groundTruth']:<12} | {s['rawOCR']:<12} | {s['corrected']:<12} | {s['cause']:<15}")
    print("=" * 85)

    return {
        "exactMatchAcc": exact_acc_pct,
        "charAcc": char_acc_pct,
        "failureCauses": failure_causes,
        "tagStats": dict(tag_stats),
        "topConfusions": confusion_list[:10],
        "failedSamples": failed_samples
    }

if __name__ == "__main__":
    run_diagnostics()
