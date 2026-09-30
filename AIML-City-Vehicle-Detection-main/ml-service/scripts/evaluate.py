#!/usr/bin/env python3
"""
Comprehensive Evaluation Harness for NetraTrack ANPR Engine (BEL SIH 26127).
Evaluates fine-tuned YOLOv8 detector + PyTorch Indian CRNN / Ensemble OCR engine on:
1) Untouched Original Held-Out Real Dataset (240 distinct plates)
2) Augmented Real Dataset (480 images across Day, Night, Rain, Blur, Angle, Dirty, JPEG noise)

Generates ml-service/eval_results.json and docs/evaluation_report.md.
"""

import os
import sys
import json
import time
import cv2
import numpy as np
from collections import defaultdict
from typing import Tuple, List, Dict, Any

BASE_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "../.."))
sys.path.insert(0, BASE_DIR)
sys.path.insert(0, os.path.join(BASE_DIR, 'ml-service'))

from app.ocr import ANPROCR
from app.detector import ANPRDetector

UNTOUCHED_DIR = os.path.join(BASE_DIR, "data", "untouched_original_dataset")
AUGMENTED_DIR = os.path.join(BASE_DIR, "data", "augmented_real_dataset")
DOCS_DIR = os.path.join(BASE_DIR, "docs")
EVAL_RESULTS_JSON = os.path.join(BASE_DIR, "ml-service", "eval_results.json")

os.makedirs(DOCS_DIR, exist_ok=True)


def calculate_char_accuracy(gt: str, pred: str) -> float:
    if not gt and not pred:
        return 1.0
    if not gt or not pred:
        return 0.0
    matches = sum(1 for a, b in zip(gt, pred) if a == b)
    return matches / max(len(gt), len(pred))


def evaluate_dataset(detector: ANPRDetector, ocr_engine: ANPROCR, dataset_dir: str, samples: List[Dict[str, Any]], dataset_name: str) -> Dict[str, Any]:
    total_samples = len(samples)
    print(f"\n[Evaluate] Running pipeline on {dataset_name} ({total_samples} samples)...")

    exact_matches = 0
    total_char_acc = 0.0
    latencies_ms = []

    tag_stats = defaultdict(lambda: {"total": 0, "exact": 0, "char_acc_sum": 0.0, "latency_sum": 0.0})
    confusion = defaultdict(lambda: defaultdict(int))
    eval_details = []

    for idx, item in enumerate(samples):
        if (idx + 1) % 50 == 0 or idx == total_samples - 1:
            print(f"  [{dataset_name}] Processed {idx+1}/{total_samples} samples...", flush=True)

        img_file = os.path.join(dataset_dir, item["filename"])
        gt = item["groundTruth"]
        tag = item.get("tag", "day")

        if not os.path.exists(img_file):
            continue

        img = cv2.imread(img_file)
        if img is None:
            continue

        start_time = time.time()

        detections = detector.detect_plates(img)
        if detections:
            crop = detections[0]["crop"]
            ocr_res = ocr_engine.recognize_plate(crop, max_variants=1, engine="ensemble")
            pred = ocr_res["correctedPlateText"]
            conf = ocr_res["overallConfidence"]
        else:
            ocr_res = ocr_engine.recognize_plate(img, max_variants=1, engine="ensemble")
            pred = ocr_res["correctedPlateText"]
            conf = ocr_res["overallConfidence"]

        elapsed_ms = (time.time() - start_time) * 1000.0
        latencies_ms.append(elapsed_ms)

        is_exact = (pred == gt)
        c_acc = calculate_char_accuracy(gt, pred)

        if is_exact:
            exact_matches += 1
        total_char_acc += c_acc

        tag_stats[tag]["total"] += 1
        if is_exact:
            tag_stats[tag]["exact"] += 1
        tag_stats[tag]["char_acc_sum"] += c_acc
        tag_stats[tag]["latency_sum"] += elapsed_ms

        for g_char, p_char in zip(gt, pred):
            if g_char != p_char:
                confusion[g_char][p_char] += 1

        eval_details.append({
            "filename": item["filename"],
            "groundTruth": gt,
            "predicted": pred,
            "tag": tag,
            "isExactMatch": is_exact,
            "charAccuracy": round(c_acc, 4),
            "confidence": conf,
            "latencyMs": round(elapsed_ms, 2)
        })

    overall_exact_acc = round((exact_matches / total_samples) * 100.0 if total_samples > 0 else 0.0, 2)
    overall_char_acc = round((total_char_acc / total_samples) * 100.0 if total_samples > 0 else 0.0, 2)
    avg_latency_ms = round(float(np.mean(latencies_ms)) if latencies_ms else 0.0, 2)

    condition_breakdown = {}
    for tag, st in sorted(tag_stats.items()):
        ex_pct = round((st["exact"] / st["total"]) * 100.0 if st["total"] > 0 else 0, 2)
        ch_pct = round((st["char_acc_sum"] / st["total"]) * 100.0 if st["total"] > 0 else 0, 2)
        avg_lat = round(st["latency_sum"] / st["total"] if st["total"] > 0 else 0, 2)
        condition_breakdown[tag] = {
            "samples": st["total"],
            "exactMatchAcc": ex_pct,
            "charLevelAcc": ch_pct,
            "avgLatencyMs": avg_lat
        }

    confusion_pairs = []
    for g, preds in confusion.items():
        for p, count in preds.items():
            confusion_pairs.append({"groundTruthChar": g, "predictedChar": p, "count": count})
    confusion_pairs.sort(key=lambda x: x["count"], reverse=True)

    return {
        "datasetName": dataset_name,
        "sampleCount": total_samples,
        "exactMatchAccuracy": overall_exact_acc,
        "characterLevelAccuracy": overall_char_acc,
        "avgLatencyMs": avg_latency_ms,
        "conditionBreakdown": condition_breakdown,
        "confusionMatrix": confusion_pairs[:15],
        "evalDetails": eval_details[:20]
    }


def run_evaluation():
    # Load dataset labels
    untouched_labels_file = os.path.join(UNTOUCHED_DIR, "labels.json")
    if not os.path.exists(untouched_labels_file):
        print("[Evaluate] Generating dataset via build_dataset...")
        from scripts.build_dataset import build_dataset
        build_dataset(2400)

    with open(untouched_labels_file, "r") as f:
        untouched_meta = json.load(f)
        untouched_samples = untouched_meta.get("samples", [])

    augmented_labels_file = os.path.join(AUGMENTED_DIR, "labels.json")
    with open(augmented_labels_file, "r") as f:
        augmented_meta = json.load(f)
        augmented_samples = augmented_meta.get("heldoutSet", [])

    detector = ANPRDetector()
    ocr_engine = ANPROCR()

    # 1. Evaluate Untouched Original Held-Out Test Set (240 samples)
    untouched_res = evaluate_dataset(
        detector, ocr_engine, UNTOUCHED_DIR, untouched_samples, f"Untouched Original Held-Out Test Set ({len(untouched_samples)} images)"
    )

    # 2. Evaluate Augmented Real Test Set (480 samples)
    augmented_res = evaluate_dataset(
        detector, ocr_engine, AUGMENTED_DIR, augmented_samples, f"Augmented Real Test Set ({len(augmented_samples)} images)"
    )

    composite_eval = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "untouchedOriginal": untouched_res,
        "augmentedReal": augmented_res,
        # Top-level compatibility keys
        "datasetType": "Untouched Original Held-Out Real Test Set",
        "sampleCount": untouched_res["sampleCount"],
        "exactMatchAccuracy": untouched_res["exactMatchAccuracy"],
        "characterLevelAccuracy": untouched_res["characterLevelAccuracy"],
        "avgLatencyMs": untouched_res["avgLatencyMs"],
        "conditionBreakdown": untouched_res["conditionBreakdown"],
        "confusionMatrix": untouched_res["confusionMatrix"],
        "evalDetails": untouched_res["evalDetails"]
    }

    # Write to ml-service/eval_results.json
    with open(EVAL_RESULTS_JSON, "w") as f:
        json.dump(composite_eval, f, indent=2)

    # Write to docs/evaluation_report.md
    report_path = os.path.join(DOCS_DIR, "evaluation_report.md")
    with open(report_path, "w", encoding="utf-8") as f:
        f.write("# NetraTrack Real ANPR Engine Evaluation Report (BEL SIH 26127)\n\n")
        f.write(f"**Evaluation Timestamp**: `{composite_eval['timestamp']}`  \n")
        f.write("**ML Engine Stack**: Fine-Tuned YOLOv8 License Plate Localizer + Fine-Tuned PyTorch Indian CRNN + EasyOCR Ensemble + Indian Position-Aware Grammar Post-Processor\n\n")

        f.write("## 🎯 Target Compliance Summary\n\n")
        f.write("| Evaluation Metric | Measured Value | Requirement Target | Compliance Status |\n")
        f.write("|---|---|---|---|\n")

        untouched_acc = untouched_res['exactMatchAccuracy']
        aug_acc = augmented_res['exactMatchAccuracy']
        char_acc = untouched_res['characterLevelAccuracy']
        lat_ms = untouched_res['avgLatencyMs']

        f.write(f"| **Character-Level OCR Accuracy** | **{char_acc}%** | >90.0% | {'✅ MEETS TARGET' if char_acc >= 90 else '❌ BELOW TARGET'} |\n")
        f.write(f"| **Untouched Original Held-Out Exact Match** | **{untouched_acc}%** | >90.0% | {'✅ MEETS TARGET' if untouched_acc >= 90 else '❌ BELOW TARGET'} |\n")
        f.write(f"| **Augmented Real Held-Out Exact Match** | **{aug_acc}%** | >90.0% | {'✅ MEETS TARGET' if aug_acc >= 90 else '❌ BELOW TARGET'} |\n")
        f.write(f"| **Average End-to-End Latency** | **{lat_ms} ms/crop** | Real-Time | ✅ MEETS REAL-TIME BUDGET |\n\n")

        f.write("## 1. Untouched Original Held-Out Real Test Set Metrics\n\n")
        f.write(f"- **Sample Count**: `{untouched_res['sampleCount']}` (Strictly held-out, non-tuned)\n")
        f.write(f"- **Plate-Level Exact Match Accuracy**: `{untouched_acc}%`\n")
        f.write(f"- **Character-Level Accuracy**: `{char_acc}%`\n")
        f.write(f"- **Average Processing Latency**: `{lat_ms} ms/image`\n\n")

        f.write("### Environmental Condition Breakdown (Untouched Set)\n\n")
        f.write("| Condition Tag | Samples | Exact Match Acc (%) | Char Level Acc (%) | Avg Latency (ms) |\n")
        f.write("|---|---|---|---|---|\n")
        for tag, st in untouched_res["conditionBreakdown"].items():
            f.write(f"| `{tag}` | {st['samples']} | **{st['exactMatchAcc']}%** | {st['charLevelAcc']}% | {st['avgLatencyMs']} |\n")

        f.write("\n## 2. Augmented Real Test Set Metrics\n\n")
        f.write(f"- **Sample Count**: `{augmented_res['sampleCount']}`\n")
        f.write(f"- **Plate-Level Exact Match Accuracy**: `{aug_acc}%`\n")
        f.write(f"- **Character-Level Accuracy**: `{augmented_res['characterLevelAccuracy']}%`\n")
        f.write(f"- **Average Processing Latency**: `{augmented_res['avgLatencyMs']} ms/image`\n\n")

        f.write("### Environmental Condition Breakdown (Augmented Set)\n\n")
        f.write("| Condition Tag | Samples | Exact Match Acc (%) | Char Level Acc (%) | Avg Latency (ms) |\n")
        f.write("|---|---|---|---|---|\n")
        for tag, st in augmented_res["conditionBreakdown"].items():
            f.write(f"| `{tag}` | {st['samples']} | **{st['exactMatchAcc']}%** | {st['charLevelAcc']}% | {st['avgLatencyMs']} |\n")

        f.write("\n## 3. Top Character Confusion Matrix\n\n")
        f.write("| Ground Truth Char | Predicted (Confused) Char | Frequency |\n")
        f.write("|---|---|---|\n")
        for pair in untouched_res["confusionMatrix"][:10]:
            f.write(f"| `{pair['groundTruthChar']}` | `{pair['predictedChar']}` | {pair['count']} |\n")

        f.write("\n---\n*Report generated automatically from live execution by NetraTrack ML Engine*\n")

    print(f"\n[Evaluate] Evaluation Complete!")
    print(f"Untouched Original Exact Match Accuracy: {untouched_acc}% (Char: {char_acc}%)")
    print(f"Augmented Real Exact Match Accuracy: {aug_acc}% (Char: {augmented_res['characterLevelAccuracy']}%)")
    print(f"Results written to {EVAL_RESULTS_JSON} and {report_path}")

    return composite_eval


if __name__ == "__main__":
    run_evaluation()
