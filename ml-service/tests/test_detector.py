import os
import cv2
import numpy as np
import pytest
from app.detector import ANPRDetector

def test_detector_initialization():
    detector = ANPRDetector()
    assert detector is not None
    # If model weights exist, is_loaded should be True
    lp_path = os.path.join(os.path.dirname(__file__), "../models/license_plate_detector.pt")
    if os.path.exists(lp_path):
        assert detector.is_loaded == True

def test_detect_plates_empty_image():
    detector = ANPRDetector()
    empty_img = np.zeros((100, 100, 3), dtype=np.uint8)
    detections = detector.detect_plates(empty_img)
    # Must return empty list for image with no plate
    assert isinstance(detections, list)
    assert len(detections) == 0

def test_detect_plates_sample_image():
    detector = ANPRDetector()
    if not detector.is_loaded:
        pytest.skip("Detector weights not loaded")

    # Generate test image with text canvas
    img = np.full((300, 600, 3), (240, 240, 240), dtype=np.uint8)
    cv2.rectangle(img, (150, 100), (450, 200), (0, 0, 0), 2)
    cv2.putText(img, "KA01M9999", (170, 160), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 0), 3)

    detections = detector.detect_plates(img)
    assert isinstance(detections, list)
