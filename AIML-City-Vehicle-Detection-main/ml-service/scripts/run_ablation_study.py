#!/usr/bin/env python3
"""
Systematic Ablation Study Across 6 Valid Pipeline Configurations (BEL SIH 26127):
Config 1: EasyOCR Baseline
Config 2: EasyOCR + Bicubic x3 Upscale
Config 3: EasyOCR + Bicubic x3 + Grammar Postprocessor
Config 4: Fine-Tuned Indian CRNN Engine Alone
Config 5: Fine-Tuned Indian CRNN + Grammar Postprocessor
Config 6: Hybrid Ensemble Recognizer (Indian CRNN + EasyOCR + Postprocessor)
"""

import os
import sys
import json
import time
import cv2
import numpy as np
from typing import Dict, List, Any

BASE_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "../.."))
sys.path.insert(0, BASE_DIR)
sys.path.insert(0, os.path.join(BASE_DIR, 'ml-service'))

from app.ocr import ANPROCR
from app.detector import ANPRDetector
from app.postprocessor import post_process_indian_plate, normalize_text

DATASET_DIR = os.path.join(BASE_DIR, "data", "augmented_real_dataset")
DOCS_DIR = os.path.join(BASE_DIR, "docs")
os.makedirs(DOCS_DIR, exist_ok=True)


def run_ablation():
    print("[Ablation] Running systematic ablation study across 6 OCR pipeline configurations...", flush=True)

    labels_path = os.path.join(DATASET_DIR, "labels.json")
    if not os.path.exists(labels_path):
        print(f"Dataset not found at {labels_path}", flush=True)
        return

    with open(labels_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        heldout_samples = data.get("heldoutSet", [])

    print(f"Evaluating on {len(heldout_samples)} held-out augmented real-photo samples...", flush=True)

    detector = ANPRDetector()
    ocr_engine = ANPROCR()

    crops_and_gts = []
    for item in heldout_samples:
        img_path = os.path.join(DATASET_DIR, item["filename"])
        if not os.path.exists(img_path):
            continue
        img = cv2.imread(img_path)
        if img is None:
            continue
        gt = item["groundTruth"]
        dets = detector.detect_plates(img)
        crop = dets[0]["crop"] if dets else img
        crops_and_gts.append((crop, gt))

    configs = [
        {"id": "Config 1", "name": "1. EasyOCR Baseline", "mode": "easyocr_raw", "postproc": False},
        {"id": "Config 2", "name": "2. EasyOCR + Bicubic x3", "mode": "easyocr_upscale", "postproc": False},
        {"id": "Config 3", "name": "3. EasyOCR + Postprocessor", "mode": "easyocr_upscale", "postproc": True},
        {"id": "Config 4", "name": "4. Indian CRNN Alone", "mode": "indian_crnn", "postproc": False},
        {"id": "Config 5", "name": "5. Indian CRNN + Postproc", "mode": "indian_crnn", "postproc": True},
        {"id": "Config 6", "name": "6. Hybrid Ensemble + Postproc", "mode": "ensemble", "postproc": True}
    ]

    ablation_results = []

    for cfg in configs:
        name = cfg["name"]
        mode = cfg["mode"]
        use_postproc = cfg["postproc"]
        print(f"  Evaluating: {name}...", flush=True)

        exact_matches = 0
        latencies = []

        for crop, gt in crops_and_gts:
            t0 = time.time()

            if mode == "easyocr_raw":
                raw_text, _ = ocr_engine._ocr_single_image(crop, engine="easyocr")
                pred = post_process_indian_plate(raw_text)["correctedPlateText"] if use_postproc else normalize_text(raw_text)
            elif mode == "easyocr_upscale":
                res = ocr_engine.recognize_plate(crop, max_variants=1, engine="easyocr")
                pred = res["correctedPlateText"] if use_postproc else res["rawPlateText"]
            elif mode == "indian_crnn":
                raw_text, _ = ocr_engine.recognize_crnn(crop)
                pred = post_process_indian_plate(raw_text)["correctedPlateText"] if use_postproc else normalize_text(raw_text)
            else:  # ensemble
                res = ocr_engine.recognize_plate(crop, max_variants=1, engine="ensemble")
                pred = res["correctedPlateText"] if use_postproc else res["rawPlateText"]

            t_proc = (time.time() - t0) * 1000.0
            latencies.append(t_proc)

            if pred == gt:
                exact_matches += 1

        acc = round((exact_matches / len(crops_and_gts)) * 100.0 if crops_and_gts else 0.0, 2)
        avg_lat = round(float(np.mean(latencies)) if latencies else 0.0, 2)

        ablation_results.append({
            "configId": cfg["id"],
            "configName": name,
            "exactMatchAcc": acc,
            "avgLatencyMs": avg_lat
        })
        print(f"    -> Acc: {acc}%, Avg Latency: {avg_lat} ms", flush=True)

    ablation_json = os.path.join(DOCS_DIR, "ablation_study.json")
    with open(ablation_json, "w") as f:
        json.dump({
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "sampleCount": len(crops_and_gts),
            "results": ablation_results
        }, f, indent=2)

    print(f"[Ablation] Finished! Results saved to {ablation_json}", flush=True)
    return ablation_results


if __name__ == "__main__":
    run_ablation()
