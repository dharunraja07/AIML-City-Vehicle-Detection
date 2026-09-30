import os
import sys
import json
import time
import cv2
import numpy as np
from collections import defaultdict
from typing import Tuple, List, Dict, Any

# Ensure ml-service root is in sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from app.ocr import ANPROCR
from app.detector import ANPRDetector
from app.postprocessor import post_process_indian_plate

REAL_DATASET_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), '../../data/real_photo_dataset'))
SYNTHETIC_DATASET_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), '../../data/synthetic_dataset'))
DOCS_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), '../../docs'))
EVAL_RESULTS_JSON = os.path.normpath(os.path.join(os.path.dirname(__file__), '../eval_results.json'))
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
        if idx % 10 == 0:
            print(f"  [{dataset_name}] Processing sample {idx+1}/{total_samples}...", flush=True)
        img_file = os.path.join(dataset_dir, item["filename"])
        gt = item["groundTruth"]
        tag = item.get("tag", "general")

        if not os.path.exists(img_file):
            continue

        img = cv2.imread(img_file)
        if img is None:
            continue

        start_time = time.time()

        detections = detector.detect_plates(img)
        if detections:
            crop = detections[0]["crop"]
            ocr_res = ocr_engine.recognize_plate(crop, max_variants=1)
            pred = ocr_res["correctedPlateText"]
            conf = ocr_res["overallConfidence"]
        else:
            ocr_res = ocr_engine.recognize_plate(img, max_variants=1)
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
    # 1. Ensure datasets exist
    real_labels_file = os.path.join(REAL_DATASET_DIR, "labels.json")
    if not os.path.exists(real_labels_file):
        print("[Evaluate] Generating Real-Photo dataset (300 samples)...")
        from build_real_dataset import build_real_photo_dataset
        build_real_photo_dataset(300)

    synthetic_labels_file = os.path.join(SYNTHETIC_DATASET_DIR, "labels.json")
    if not os.path.exists(synthetic_labels_file):
        print("[Evaluate] Generating Synthetic dataset (120 samples)...")
        from generate_synthetic import create_synthetic_dataset
        create_synthetic_dataset(120)

    # 2. Load dataset samples
    with open(real_labels_file, "r") as f:
        real_data = json.load(f)
        real_heldout_samples = real_data.get("heldoutSet", [])

    with open(synthetic_labels_file, "r") as f:
        synthetic_samples = json.load(f)

    detector = ANPRDetector()
    ocr_engine = ANPROCR()

    # 3. Evaluate Real-Photo Held-Out Test Set (150 samples)
    real_heldout_res = evaluate_dataset(
        detector, ocr_engine, REAL_DATASET_DIR, real_heldout_samples, "Real-Photo Held-Out Test Set (150 images)"
    )

    # 4. Evaluate Synthetic Dataset (120 samples)
    synthetic_res = evaluate_dataset(
        detector, ocr_engine, SYNTHETIC_DATASET_DIR, synthetic_samples, "Synthetic Benchmark Set (120 images)"
    )

    # Composite results
    composite_eval = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "realHeldout": real_heldout_res,
        "synthetic": synthetic_res,
        # Keep top-level keys for backward compatibility with frontend widgets
        "datasetType": "Real-Photo Held-Out Test Set + Synthetic Benchmark",
        "sampleCount": real_heldout_res["sampleCount"],
        "exactMatchAccuracy": real_heldout_res["exactMatchAccuracy"],
        "characterLevelAccuracy": real_heldout_res["characterLevelAccuracy"],
        "avgLatencyMs": real_heldout_res["avgLatencyMs"],
        "conditionBreakdown": real_heldout_res["conditionBreakdown"],
        "confusionMatrix": real_heldout_res["confusionMatrix"],
        "evalDetails": real_heldout_res["evalDetails"]
    }

    # Write to ml-service/eval_results.json
    with open(EVAL_RESULTS_JSON, "w") as f:
        json.dump(composite_eval, f, indent=2)

    # Write to docs/evaluation_report.md
    report_path = os.path.join(DOCS_DIR, "evaluation_report.md")
    with open(report_path, "w") as f:
        f.write("# NetraTrack Real ANPR Engine Evaluation Report\n\n")
        f.write(f"**Evaluation Timestamp**: `{composite_eval['timestamp']}`\n\n")

        f.write("## 1. Real-Photo Held-Out Test Set (Primary Benchmark)\n\n")
        f.write(f"- **Sample Count**: `{real_heldout_res['sampleCount']}` (Strictly held-out, non-tuned)\n")
        f.write(f"- **Plate-Level Exact Match Accuracy**: `{real_heldout_res['exactMatchAccuracy']}%`\n")
        f.write(f"- **Character-Level Accuracy**: `{real_heldout_res['characterLevelAccuracy']}%`\n")
        f.write(f"- **Average Latency**: `{real_heldout_res['avgLatencyMs']} ms/image`\n\n")

        f.write("### Environmental Condition Breakdown (Real-Photo Held-Out)\n\n")
        f.write("| Condition Tag | Samples | Exact Match Acc (%) | Char Level Acc (%) | Avg Latency (ms) |\n")
        f.write("|--------------|---------|---------------------|--------------------|------------------|\n")
        for tag, st in real_heldout_res["conditionBreakdown"].items():
            f.write(f"| `{tag}` | {st['samples']} | {st['exactMatchAcc']}% | {st['charLevelAcc']}% | {st['avgLatencyMs']} |\n")

        f.write("\n## 2. Synthetic Indian Plate Benchmark Set (Secondary Benchmark)\n\n")
        f.write(f"- **Sample Count**: `{synthetic_res['sampleCount']}`\n")
        f.write(f"- **Plate-Level Exact Match Accuracy**: `{synthetic_res['exactMatchAccuracy']}%`\n")
        f.write(f"- **Character-Level Accuracy**: `{synthetic_res['characterLevelAccuracy']}%`\n")
        f.write(f"- **Average Latency**: `{synthetic_res['avgLatencyMs']} ms/image`\n\n")

        f.write("### Environmental Condition Breakdown (Synthetic Set)\n\n")
        f.write("| Condition Tag | Samples | Exact Match Acc (%) | Char Level Acc (%) | Avg Latency (ms) |\n")
        f.write("|--------------|---------|---------------------|--------------------|------------------|\n")
        for tag, st in synthetic_res["conditionBreakdown"].items():
            f.write(f"| `{tag}` | {st['samples']} | {st['exactMatchAcc']}% | {st['charLevelAcc']}% | {st['avgLatencyMs']} |\n")

        f.write("\n## 3. Top Character Confusion Matrix (Held-Out Test Set)\n\n")
        f.write("| Ground Truth Char | Predicted (Confused) Char | Frequency |\n")
        f.write("|-------------------|--------------------------|----------|\n")
        for pair in real_heldout_res["confusionMatrix"][:10]:
            f.write(f"| `{pair['groundTruthChar']}` | `{pair['predictedChar']}` | {pair['count']} |\n")

        f.write("\n\n---\n*Report generated automatically from live evaluation execution by NetraTrack ML Engine*\n")

    print(f"\n[Evaluate] Evaluation Complete!")
    print(f"Real Held-Out Exact Accuracy: {real_heldout_res['exactMatchAccuracy']}% (Char: {real_heldout_res['characterLevelAccuracy']}%)")
    print(f"Synthetic Exact Accuracy: {synthetic_res['exactMatchAccuracy']}% (Char: {synthetic_res['characterLevelAccuracy']}%)")
    print(f"Results written to {EVAL_RESULTS_JSON} and {report_path}")

    return composite_eval


if __name__ == "__main__":
    run_evaluation()
