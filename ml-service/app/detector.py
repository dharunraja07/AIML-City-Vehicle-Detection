import os
import logging
import cv2
import numpy as np
from typing import List, Dict, Any, Tuple, Optional

logger = logging.getLogger("netratrack.detector")

class ANPRDetector:
    def __init__(self, model_dir: str = None):
        if model_dir is None:
            model_dir = os.path.join(os.path.dirname(__file__), "../models")

        self.model_dir = model_dir
        self.plate_model_path = os.path.join(model_dir, "license_plate_detector.pt")
        self.coco_model_path = os.path.join(model_dir, "yolov8n.pt")

        self.plate_model = None
        self.coco_model = None
        self.is_loaded = False

        self._load_models()

    def _load_models(self):
        """Load Ultralytics YOLOv8 license plate and COCO vehicle detector models."""
        try:
            from ultralytics import YOLO

            if not os.path.exists(self.plate_model_path):
                logger.error(f"License plate detector model missing at: {self.plate_model_path}")
                self.is_loaded = False
                return

            self.plate_model = YOLO(self.plate_model_path)

            # Load COCO model for vehicle classification (auto-downloads if missing)
            if os.path.exists(self.coco_model_path):
                self.coco_model = YOLO(self.coco_model_path)
            else:
                self.coco_model = YOLO("yolov8n.pt")

            self.is_loaded = True
            logger.info("Successfully loaded YOLOv8 license plate & vehicle detector models.")

        except Exception as e:
            logger.error(f"Failed to initialize YOLOv8 detector models: {e}")
            self.is_loaded = False

    def detect_vehicles(self, image: np.ndarray) -> List[Dict[str, Any]]:
        """Detect vehicle bounding boxes and types using COCO YOLOv8 model."""
        if not self.coco_model or image is None or image.size == 0:
            return []

        # COCO class IDs: 2: car, 3: motorcycle, 5: bus, 7: truck
        vehicle_class_map = {
            2: "CAR",
            3: "MOTORCYCLE",
            5: "BUS",
            7: "TRUCK"
        }

        vehicles = []
        results = self.coco_model(image, verbose=False)
        for r in results:
            boxes = r.boxes
            if boxes is None:
                continue
            for box in boxes:
                cls_id = int(box.cls[0].item())
                if cls_id in vehicle_class_map:
                    xyxy = box.xyxy[0].cpu().numpy().astype(int).tolist()
                    conf = float(box.conf[0].item())
                    vehicles.append({
                        "bbox": xyxy,
                        "type": vehicle_class_map[cls_id],
                        "confidence": conf
                    })
        return vehicles

    def _associate_vehicle(self, plate_bbox: List[int], vehicles: List[Dict[str, Any]]) -> str:
        """Associate license plate with the vehicle box that encloses it."""
        px1, py1, px2, py2 = plate_bbox
        plate_area = max(1, (px2 - px1) * (py2 - py1))

        best_vehicle = "CAR"
        max_containment = 0.0

        for v in vehicles:
            vx1, vy1, vx2, vy2 = v["bbox"]
            # Intersection area
            ix1 = max(px1, vx1)
            iy1 = max(py1, vy1)
            ix2 = min(px2, vx2)
            iy2 = min(py2, vy2)

            if ix2 > ix1 and iy2 > iy1:
                intersection = (ix2 - ix1) * (iy2 - iy1)
                containment = intersection / plate_area
                if containment > max_containment:
                    max_containment = containment
                    best_vehicle = v["type"]

        return best_vehicle

    def detect_plates(self, image: np.ndarray) -> List[Dict[str, Any]]:
        """Detect license plate bounding boxes and crops using YOLOv8.
        Returns empty list [] if no plate is detected. NEVER returns fallback center crop.
        """
        if not self.is_loaded or self.plate_model is None or image is None or image.size == 0:
            return []

        h, w = image.shape[:2]
        vehicles = self.detect_vehicles(image)
        detections = []

        try:
            results = self.plate_model(image, verbose=False)
            for r in results:
                boxes = r.boxes
                if boxes is None:
                    continue
                for box in boxes:
                    xyxy = box.xyxy[0].cpu().numpy().astype(int).tolist()
                    conf = float(box.conf[0].item())

                    if conf < 0.25:
                        continue

                    x1, y1, x2, y2 = xyxy
                    # Clamp coordinates
                    x1 = max(0, x1)
                    y1 = max(0, y1)
                    x2 = min(w, x2)
                    y2 = min(h, y2)

                    if x2 - x1 < 10 or y2 - y1 < 10:
                        continue

                    crop = image[y1:y2, x1:x2]
                    v_type = self._associate_vehicle([x1, y1, x2, y2], vehicles)

                    detections.append({
                        "bbox": [x1, y1, x2, y2],
                        "crop": crop,
                        "confidence": round(conf, 2),
                        "vehicleType": v_type
                    })

        except Exception as e:
            logger.error(f"Error during plate detection: {e}")

        # Strictly return detections found by model (empty if none found)
        return detections
