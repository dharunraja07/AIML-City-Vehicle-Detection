# Machine Learning Models Provenance & Specifications

This directory contains pre-trained computer vision model weights used by NetraTrack ML Service for vehicle and license plate detection.

## Models Summary

| Model File | Target Class | Architecture / Base | Source / Provenance URL | License | File Size |
|---|---|---|---|---|---|
| `license_plate_detector.pt` | License Plate | YOLOv8 Nano (Custom fine-tuned) | [Muhammad-Zeerak-Khan ALPR Repository](https://github.com/Muhammad-Zeerak-Khan/Automatic-License-Plate-Recognition-using-YOLOv8/raw/main/license_plate_detector.pt) | MIT / Open Source | ~6.2 MB |
| `yolov8n.pt` | COCO Vehicles (`car`, `motorcycle`, `bus`, `truck`) | YOLOv8 Nano Base | [Ultralytics Assets v8.2.0 Release](https://github.com/ultralytics/assets/releases/download/v8.2.0/yolov8n.pt) | AGPL-3.0 / Enterprise | ~6.5 MB |

## Downloading & Verification

Models can be automatically fetched or verified by running:

```bash
python scripts/download_models.py
```

If the model files are already present and non-empty in `ml-service/models/`, the download script will verify their existence without re-downloading.

## Usage in Codebase

- `license_plate_detector.pt`: Used in `app/detector.py` to localize license plate bounding boxes in incoming frames or image uploads.
- `yolov8n.pt`: Used in `app/detector.py` to localize and classify target vehicles (COCO classes 2: car, 3: motorcycle, 5: bus, 7: truck) for context crop extraction.
