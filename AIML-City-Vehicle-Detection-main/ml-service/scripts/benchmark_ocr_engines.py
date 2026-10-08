#!/usr/bin/env python3
"""
Benchmarks OCR Engines on Held-Out Indian License Plate Test Set.
Compares:
1) EasyOCR Engine
2) Fine-Tuned PyTorch Indian CRNN Engine
3) Hybrid Ensemble Recognizer (CRNN + EasyOCR Consensus)
"""

import os
import sys
import json
import cv2
import numpy as np

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), '../..'))
sys.path.insert(0, BASE_DIR)
sys.path.insert(0, os.path.join(BASE_DIR, 'ml-service'))

from app.ocr import ANPROCR
from app.detector import ANPRDetector

DATASET_DIR = os.path.join(BASE_DIR, "data", "untouched_original_dataset")


def calculate_char_accuracy(gt: str, pred: str) -> float:
    if not gt and not pred:
        return 1.0
    if not gt or not pred:
        return 0.0
    matches = sum(1 for a, b in zip(gt, pred) if a == b)
    return matches / max(len(gt), len(pred))


def benchmark_engines():
    labels_path = os.path.join(DATASET_DIR, "labels.json")
    if not os.path.exists(labels_path):
        print(f"Dataset labels not found at {labels_path}")
        return

    with open(labels_path, "r", encoding="utf-8") as f:
        meta = json.load(f)

    samples = meta.get("samples", [])
    print("===========================================================")
    print(f" [BENCHMARK] OCR ENGINES ON HELD-OUT TEST SET ({len(samples)} SAMPLES)")
    print("===========================================================\n")

    detector = ANPRDetector()
    anpr_ocr = ANPROCR()

    engines_to_test = [
        ("EasyOCR Engine", "easyocr"),
        ("Fine-Tuned Indian CRNN Engine", "indian_crnn"),
        ("Hybrid Ensemble Recognizer (CRNN + EasyOCR)", "ensemble")
    ]

    results_summary = []

    for name, mode in engines_to_test:
        exact_matches = 0
        total_char_acc = 0.0
        n_samples = 0

        for item in samples:
            img_path = os.path.join(DATASET_DIR, item["filename"])
            gt = item["groundTruth"]
            img = cv2.imread(img_path)
            if img is None:
                continue

            dets = detector.detect_plates(img)
            crop = dets[0]["crop"] if dets else img

            ocr_res = anpr_ocr.recognize_plate(crop, engine=mode)
            pred = ocr_res["correctedPlateText"]

            if pred == gt:
                exact_matches += 1
            total_char_acc += calculate_char_accuracy(gt, pred)
            n_samples += 1

        exact_pct = round((exact_matches / n_samples) * 100.0 if n_samples > 0 else 0.0, 2)
        char_pct = round((total_char_acc / n_samples) * 100.0 if n_samples > 0 else 0.0, 2)

        print(f"Result for {name}:")
        print(f"  - Exact Match Accuracy: {exact_pct:.2f}% ({exact_matches}/{n_samples})")
        print(f"  - Character Level Acc:  {char_pct:.2f}%\n")

        results_summary.append({
            "engine": name,
            "exactMatchAcc": exact_pct,
            "charAcc": char_pct
        })

    best_engine = max(results_summary, key=lambda x: x["exactMatchAcc"])
    print(f"WINNER: {best_engine['engine']} ({best_engine['exactMatchAcc']}%)")
    return results_summary


if __name__ == "__main__":
    benchmark_engines()
