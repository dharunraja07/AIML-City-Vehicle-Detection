import os
import io
import time
import uuid
import tempfile
import logging
import cv2
import numpy as np
import json
from PIL import Image
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from app.detector import ANPRDetector
from app.ocr import ANPROCR
from app.tracking import MultiFrameConsensusTracker
from app.preprocessor import cv2_to_b64

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("netratrack.main")

app = FastAPI(
    title="NetraTrack ANPR ML Engine",
    description="Real ANPR & Multi-Frame Consensus Tracking Engine for Indian License Plates",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize engines
detector = ANPRDetector()
ocr_engine = ANPROCR()
tracker = MultiFrameConsensusTracker()

# In-memory video jobs store
VIDEO_JOBS: Dict[str, Dict[str, Any]] = {}
TEMP_DIR = tempfile.gettempdir()
EVAL_RESULTS_PATH = os.path.join(os.path.dirname(__file__), "eval_results.json")

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv"}
MAX_IMAGE_SIZE_BYTES = 15 * 1024 * 1024  # 15 MB
MAX_VIDEO_SIZE_BYTES = 100 * 1024 * 1024 # 100 MB


def validate_image_file(file: UploadFile):
    ext = os.path.splitext(file.filename)[1].lower() if file.filename else ""
    if ext and ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file extension '{ext}'. Allowed image formats: {', '.join(ALLOWED_IMAGE_EXTENSIONS)}"
        )


def validate_video_file(file: UploadFile):
    ext = os.path.splitext(file.filename)[1].lower() if file.filename else ""
    if ext and ext not in ALLOWED_VIDEO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid video extension '{ext}'. Allowed video formats: {', '.join(ALLOWED_VIDEO_EXTENSIONS)}"
        )


@app.get("/health")
def health_check():
    detector_status = "loaded" if detector.is_loaded else "not loaded"
    status_str = "HEALTHY" if detector.is_loaded else "UNHEALTHY"

    return {
        "status": status_str,
        "service": "NetraTrack ANPR ML Engine",
        "detector": detector_status,
        "ocr": "EasyOCR" if ocr_engine.reader is not None else "Contour Fallback",
        "gpuAvailable": False
    }


@app.post("/anpr/image")
async def process_image(
    file: Optional[UploadFile] = File(None),
    cameraId: Optional[str] = Form("CAM-CBE-001")
):
    if file is None:
        raise HTTPException(status_code=400, detail="No image file uploaded")

    validate_image_file(file)
    contents = await file.read()

    if len(contents) > MAX_IMAGE_SIZE_BYTES:
        raise HTTPException(status_code=413, detail=f"Image size exceeds max limit of {MAX_IMAGE_SIZE_BYTES // (1024*1024)}MB")

    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None or img.size == 0:
        raise HTTPException(status_code=400, detail="Failed to decode image file")

    if not detector.is_loaded:
        raise HTTPException(status_code=503, detail="License plate detector model weights are not loaded. Run scripts/download_models.py first.")

    detections = detector.detect_plates(img)
    results = []

    for det in detections:
        crop = det["crop"]
        ocr_res = ocr_engine.recognize_plate(crop)

        results.append({
            "bbox": det["bbox"],
            "plateText": ocr_res["correctedPlateText"],
            "rawPlateText": ocr_res["rawPlateText"],
            "confidence": ocr_res["overallConfidence"],
            "charConfidences": ocr_res["charConfidences"],
            "vehicleType": det["vehicleType"],
            "isValid": ocr_res["isValid"],
            "stateCode": ocr_res["stateCode"],
            "plateType": ocr_res["plateType"],
            "cameraId": cameraId,
            "stages": ocr_res["stages"]
        })

    return {
        "status": "SUCCESS",
        "detectionCount": len(results),
        "detections": results
    }


def background_process_video(job_id: str, video_path: str, stride: int = 3):
    """Background task to process uploaded video frame-by-frame."""
    try:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            VIDEO_JOBS[job_id]["status"] = "FAILED"
            VIDEO_JOBS[job_id]["error"] = "Could not open video file"
            return

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        VIDEO_JOBS[job_id]["totalFrames"] = total_frames
        VIDEO_JOBS[job_id]["status"] = "PROCESSING"

        annotated_video_path = os.path.join(TEMP_DIR, f"annotated_{job_id}.mp4")
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(annotated_video_path, fourcc, fps / stride, (w, h))

        local_tracker = MultiFrameConsensusTracker()
        track_details = {}
        processed_count = 0
        start_time = time.time()

        frame_idx = 0
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            if frame_idx % stride == 0:
                sec = frame_idx / fps
                detections = detector.detect_plates(frame)

                for det in detections:
                    crop = det["crop"]
                    ocr_res = ocr_engine.recognize_plate(crop)

                    # Simple spatial tracking ID based on box center
                    bbox = det["bbox"]
                    cx, cy = (bbox[0] + bbox[2]) // 2, (bbox[1] + bbox[3]) // 2
                    track_id = f"TRK-{cx//80}-{cy//80}"

                    local_tracker.add_frame_detection(track_id, ocr_res, timestamp=sec)
                    consensus = local_tracker.get_consensus_plate(track_id)

                    if track_id not in track_details:
                        track_details[track_id] = {
                            "firstSeenSec": round(sec, 2),
                            "bestFrameSnapshot": cv2_to_b64(crop),
                            "vehicleType": det["vehicleType"]
                        }
                    track_details[track_id]["lastSeenSec"] = round(sec, 2)
                    track_details[track_id]["consensus"] = consensus

                    # Annotate frame
                    x1, y1, x2, y2 = bbox
                    label = f"{consensus['plateText']} ({det['vehicleType']})"
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                    cv2.putText(frame, label, (x1, max(20, y1 - 10)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

                out.write(frame)
                processed_count += 1
                VIDEO_JOBS[job_id]["framesProcessed"] = frame_idx
                VIDEO_JOBS[job_id]["progress"] = min(99, int((frame_idx / total_frames) * 100)) if total_frames > 0 else 50

            frame_idx += 1

        cap.release()
        out.release()

        elapsed = time.time() - start_time
        processing_fps = round(processed_count / elapsed, 2) if elapsed > 0 else 0.0

        # Build final job summary
        unique_plates_set = set()
        plates_summary = []
        conf_sum = 0.0

        for tid, tinfo in track_details.items():
            cons = tinfo["consensus"]
            p_text = cons["plateText"]
            if p_text:
                unique_plates_set.add(p_text)
                conf_sum += cons["consensusConfidence"]
                plates_summary.append({
                    "plateText": p_text,
                    "firstSeenSec": tinfo["firstSeenSec"],
                    "lastSeenSec": tinfo["lastSeenSec"],
                    "bestFrameSnapshot": tinfo["bestFrameSnapshot"],
                    "consensusConfidence": cons["consensusConfidence"],
                    "frameCount": cons["frameCount"],
                    "vehicleType": tinfo["vehicleType"]
                })

        avg_conf = round(conf_sum / len(plates_summary), 2) if plates_summary else 0.0

        VIDEO_JOBS[job_id]["status"] = "COMPLETED"
        VIDEO_JOBS[job_id]["progress"] = 100
        VIDEO_JOBS[job_id]["annotatedVideoPath"] = annotated_video_path
        VIDEO_JOBS[job_id]["summary"] = {
            "totalTracks": len(track_details),
            "uniquePlates": len(unique_plates_set),
            "avgConfidence": avg_conf,
            "processingFps": processing_fps,
            "plates": plates_summary
        }

    except Exception as e:
        logger.error(f"Error processing video job {job_id}: {e}")
        VIDEO_JOBS[job_id]["status"] = "FAILED"
        VIDEO_JOBS[job_id]["error"] = str(e)


@app.post("/anpr/video")
async def process_video(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    stride: int = Form(3)
):
    validate_video_file(file)
    contents = await file.read()

    if len(contents) > MAX_VIDEO_SIZE_BYTES:
        raise HTTPException(status_code=413, detail=f"Video file exceeds max limit of {MAX_VIDEO_SIZE_BYTES // (1024*1024)}MB")

    job_id = str(uuid.uuid4())
    temp_video_path = os.path.join(TEMP_DIR, f"input_{job_id}_{file.filename}")

    with open(temp_video_path, "wb") as f:
        f.write(contents)

    VIDEO_JOBS[job_id] = {
        "jobId": job_id,
        "status": "QUEUED",
        "progress": 0,
        "framesProcessed": 0,
        "totalFrames": 0,
        "summary": None,
        "error": None
    }

    background_tasks.add_task(background_process_video, job_id, temp_video_path, stride)

    return {
        "jobId": job_id,
        "status": "QUEUED",
        "message": "Video uploaded successfully and processing started in background."
    }


@app.get("/anpr/jobs/{job_id}")
def get_job_status(job_id: str):
    if job_id not in VIDEO_JOBS:
        raise HTTPException(status_code=404, detail="Job ID not found")
    return VIDEO_JOBS[job_id]


@app.get("/anpr/jobs/{job_id}/annotated")
def get_annotated_video(job_id: str):
    if job_id not in VIDEO_JOBS:
        raise HTTPException(status_code=404, detail="Job ID not found")

    job = VIDEO_JOBS[job_id]
    if job["status"] != "COMPLETED" or not job.get("annotatedVideoPath"):
        raise HTTPException(status_code=400, detail="Annotated video is not ready yet")

    path = job["annotatedVideoPath"]
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Annotated video file not found")

    return FileResponse(path, media_type="video/mp4", filename=f"annotated_{job_id}.mp4")


@app.post("/anpr/batch")
async def process_batch(files: List[UploadFile] = File(...)):
    """Process multiple real uploaded images in batch."""
    if not files:
        raise HTTPException(status_code=400, detail="No files provided in batch upload")

    if not detector.is_loaded:
        raise HTTPException(status_code=503, detail="License plate detector model weights are not loaded.")

    batch_results = []
    for idx, file in enumerate(files):
        try:
            validate_image_file(file)
            contents = await file.read()
            nparr = np.frombuffer(contents, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if img is None:
                batch_results.append({"index": idx, "filename": file.filename, "error": "Invalid image format"})
                continue

            detections = detector.detect_plates(img)
            img_results = []
            for det in detections:
                ocr_res = ocr_engine.recognize_plate(det["crop"])
                img_results.append({
                    "bbox": det["bbox"],
                    "plateText": ocr_res["correctedPlateText"],
                    "confidence": ocr_res["overallConfidence"],
                    "vehicleType": det["vehicleType"],
                    "isValid": ocr_res["isValid"]
                })

            batch_results.append({
                "index": idx,
                "filename": file.filename,
                "detectionCount": len(img_results),
                "detections": img_results
            })

        except Exception as e:
            batch_results.append({"index": idx, "filename": file.filename, "error": str(e)})

    return {"processedCount": len(batch_results), "results": batch_results}


@app.get("/anpr/eval-results")
def get_eval_results():
    if not os.path.exists(EVAL_RESULTS_PATH):
        return JSONResponse(status_code=404, content={"message": "No evaluation run yet"})
    try:
        with open(EVAL_RESULTS_PATH, "r") as f:
            data = json.load(f)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/anpr/evaluate")
def run_evaluation_trigger(background_tasks: BackgroundTasks):
    from scripts.evaluate import run_evaluation
    background_tasks.add_task(run_evaluation)
    return {"status": "STARTED", "message": "Evaluation job started in background."}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
