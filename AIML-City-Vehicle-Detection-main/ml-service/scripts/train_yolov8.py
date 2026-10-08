#!/usr/bin/env python3
"""
Fine-tunes YOLOv8 License Plate Detector on the 2400-plate Indian dataset.
Saves results.csv and training metrics to docs/training/ and trained weights to ml-service/models/license_plate_detector.pt.
"""

import os
import shutil
import pandas as pd
from ultralytics import YOLO

BASE_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "../.."))
YOLO_YAML = os.path.join(BASE_DIR, "data", "dataset_yolo", "dataset.yaml")
DOCS_TRAINING_DIR = os.path.join(BASE_DIR, "docs", "training")
MODEL_DEST = os.path.join(BASE_DIR, "ml-service", "models", "license_plate_detector.pt")

os.makedirs(DOCS_TRAINING_DIR, exist_ok=True)
os.makedirs(os.path.dirname(MODEL_DEST), exist_ok=True)


def train_yolov8_detector():
    print("===========================================================")
    print(" 🚀 Fine-Tuning YOLOv8 License Plate Detector on Indian Data")
    print("===========================================================\n")

    model = YOLO("yolov8n.pt")

    # Train for 10 epochs (fast & accurate fine-tuning)
    results = model.train(
        data=YOLO_YAML,
        epochs=10,
        imgsz=640,
        batch=16,
        name="netratrack_yolo_indian",
        project=os.path.join(BASE_DIR, "runs"),
        exist_ok=True,
        verbose=True
    )

    run_dir = os.path.join(BASE_DIR, "runs", "netratrack_yolo_indian")
    weights_best = os.path.join(run_dir, "weights", "best.pt")

    if os.path.exists(weights_best):
        shutil.copy(weights_best, MODEL_DEST)
        print(f"[OK] Saved fine-tuned weights to {MODEL_DEST}")

    # Copy results.csv and curves to docs/training/
    results_csv = os.path.join(run_dir, "results.csv")
    if os.path.exists(results_csv):
        shutil.copy(results_csv, os.path.join(DOCS_TRAINING_DIR, "results.csv"))
        print(f"[OK] Saved training log to {os.path.join(DOCS_TRAINING_DIR, 'results.csv')}")

    for img_name in ["results.png", "confusion_matrix.png", "F1_curve.png", "PR_curve.png"]:
        src_img = os.path.join(run_dir, img_name)
        if os.path.exists(src_img):
            shutil.copy(src_img, os.path.join(DOCS_TRAINING_DIR, img_name))

    print("\n[OK] YOLOv8 fine-tuning complete!")


if __name__ == "__main__":
    train_yolov8_detector()
