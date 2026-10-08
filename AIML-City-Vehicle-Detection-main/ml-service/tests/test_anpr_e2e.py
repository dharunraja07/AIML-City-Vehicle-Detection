import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "detector" in data
    assert "ocr" in data

def test_process_image_no_file():
    response = client.post("/anpr/image")
    assert response.status_code == 400

def test_process_image_invalid_extension():
    response = client.post(
        "/anpr/image",
        files={"file": ("test.txt", b"invalid content", "text/plain")}
    )
    assert response.status_code == 400

def test_process_image_valid_sample():
    # Generate synthetic image canvas
    img = np.full((300, 600, 3), (240, 240, 240), dtype=np.uint8)
    cv2.rectangle(img, (150, 100), (450, 200), (0, 0, 0), 2)
    cv2.putText(img, "TN34AB1234", (170, 160), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 0), 3)

    _, img_encoded = cv2.imencode(".jpg", img)
    response = client.post(
        "/anpr/image",
        files={"file": ("sample.jpg", img_encoded.tobytes(), "image/jpeg")}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "SUCCESS"
    assert "detections" in data

def test_eval_results_endpoint():
    response = client.get("/anpr/eval-results")
    assert response.status_code in (200, 404)
