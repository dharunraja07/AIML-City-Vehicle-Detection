import os
import sys
import urllib.request

MODELS_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "../models"))
os.makedirs(MODELS_DIR, exist_ok=True)

# Direct public license plate detector YOLOv8 model URL
LICENSE_PLATE_MODEL_URL = "https://github.com/Muhammad-Zeerak-Khan/Automatic-License-Plate-Recognition-using-YOLOv8/raw/main/license_plate_detector.pt"
COCO_MODEL_URL = "https://github.com/ultralytics/assets/releases/download/v8.2.0/yolov8n.pt"

def download_file(url: str, destination: str):
    print(f"Downloading {url}...")
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
        with urllib.request.urlopen(req) as response, open(destination, 'wb') as out_file:
            data = response.read()
            out_file.write(data)
        print(f"Saved model to {os.path.abspath(destination)} ({len(data)} bytes)")
    except Exception as e:
        print(f"Failed to download from {url}: {e}")

def main():
    lp_path = os.path.join(MODELS_DIR, "license_plate_detector.pt")
    if not os.path.exists(lp_path) or os.path.getsize(lp_path) < 1000:
        download_file(LICENSE_PLATE_MODEL_URL, lp_path)
    else:
        print(f"License plate model already exists at {os.path.abspath(lp_path)}")

    coco_path = os.path.join(MODELS_DIR, "yolov8n.pt")
    if not os.path.exists(coco_path) or os.path.getsize(coco_path) < 1000:
        download_file(COCO_MODEL_URL, coco_path)
    else:
        print(f"COCO vehicle model already exists at {os.path.abspath(coco_path)}")

if __name__ == "__main__":
    main()
