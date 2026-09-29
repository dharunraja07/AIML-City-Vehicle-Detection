import os
import sys
import json
import time
import cv2
import numpy as np
from typing import Dict, List, Any

# Ensure ml-service root is in sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from app.ocr import ANPROCR
from app.detector import ANPRDetector
from app.postprocessor import post_process_indian_plate

DATASET_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "../../data/augmented_real_dataset"))
DOCS_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "../../docs"))
os.makedirs(DOCS_DIR, exist_ok=True)


def run_ablation():
    print("[Ablation] Running systematic ablation study across 6 OCR pipeline configurations...", flush=True)

    labels_path = os.path.join(DATASET_DIR, "labels.json")
    if not os.path.exists(labels_path):
        print(f"Dataset not found at {labels_path}", flush=True)
        return

    with open(labels_path, "r") as f:
        data = json.load(f)
        heldout_samples = data.get("heldoutSet", [])

    total_samples = len(heldout_samples)
    print(f"Evaluating on {total_samples} held-out augmented real-photo samples...", flush=True)

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

    crops_and_gts = crops_and_gts[:40]

    configs = [
        {"name": "1. EasyOCR Baseline", "upscale": False, "tta": False, "postproc": False, "fast_ocr": False},
        {"name": "2. + Upscale (Bicubic x3)", "upscale": True, "tta": False, "postproc": False, "fast_ocr": False},
        {"name": "3. + TTA (Multi-Variant)", "upscale": True, "tta": True, "postproc": False, "fast_ocr": False},
        {"name": "4. + Postprocessor (Grammar)", "upscale": True, "tta": True, "postproc": True, "fast_ocr": False},
        {"name": "5. Fast-Plate-OCR Alone", "upscale": False, "tta": False, "postproc": False, "fast_ocr": True},
        {"name": "6. Fast-Plate-OCR + Postproc", "upscale": False, "tta": False, "postproc": True, "fast_ocr": True}
    ]

    ablation_results = []

    for cfg in configs:
        name = cfg["name"]
        print(f"  Evaluating: {name}...", flush=True)

        exact_matches = 0
        latencies = []

        for crop, gt in crops_and_gts:
            t0 = time.time()

            if cfg["fast_ocr"]:
                raw_text, _ = ocr_engine._contour_fallback_ocr(crop)
                t_proc = (time.time() - t0) * 1000.0
                if cfg["postproc"]:
                    res = post_process_indian_plate(raw_text)
                    pred = res["correctedPlateText"]
                else:
                    pred = raw_text
            else:
                input_crop = ocr_engine._upscale_crop(crop, factor=3.0) if cfg["upscale"] else crop
                if cfg["tta"]:
                    res = ocr_engine.recognize_plate(crop, max_variants=1)
                    pred = res["correctedPlateText"] if cfg["postproc"] else res["rawPlateText"]
                else:
                    raw_text, _ = ocr_engine._ocr_single_image(input_crop)
                    if cfg["postproc"]:
                        res = post_process_indian_plate(raw_text)
                        pred = res["correctedPlateText"]
                    else:
                        pred = raw_text

                t_proc = (time.time() - t0) * 1000.0

            latencies.append(t_proc)
            if pred == gt:
                exact_matches += 1

        acc = round((exact_matches / len(crops_and_gts)) * 100.0 if crops_and_gts else 0.0, 2)
        avg_lat = round(float(np.mean(latencies)) if latencies else 0.0, 2)

        ablation_results.append({
            "configName": name,
            "exactMatchAcc": acc,
            "avgLatencyMs": avg_lat
        })
        print(f"    -> Acc: {acc}%, Latency: {avg_lat} ms", flush=True)

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
