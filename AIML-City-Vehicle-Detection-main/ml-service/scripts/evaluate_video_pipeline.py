import os
import sys
import json
import time
import cv2
import numpy as np
from typing import Dict, List, Any

# Ensure ml-service root is in sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from app.detector import ANPRDetector
from app.ocr import ANPROCR
from app.tracking import MultiFrameConsensusTracker

VIDEO_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "../../data/video_dataset"))
DOCS_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "../../docs"))
os.makedirs(VIDEO_DIR, exist_ok=True)
os.makedirs(DOCS_DIR, exist_ok=True)


def create_mock_traffic_video(clip_id: int, ground_truth_vehicles: List[Dict[str, Any]]) -> str:
    """Generates a synthetic traffic clip video file with moving vehicles and license plates."""
    video_filename = f"clip_{clip_id:02d}.mp4"
    video_path = os.path.join(VIDEO_DIR, video_filename)

    w, h = 640, 360
    fps = 15
    num_frames = 45 # 3 seconds clip

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(video_path, fourcc, fps, (w, h))

    for frame_idx in range(num_frames):
        # Road background
        frame = np.full((h, w, 3), (60, 60, 65), dtype=np.uint8)

        # Lane markings
        for y in range(0, h, 40):
            cv2.line(frame, (w//2, y), (w//2, y+20), (255, 255, 255), 2)

        # Draw moving vehicles
        for v in ground_truth_vehicles:
            start_x, start_y = v["startX"], v["startY"]
            dx, dy = v["dx"], v["dy"]

            cur_x = int(start_x + frame_idx * dx)
            cur_y = int(start_y + frame_idx * dy)

            # Draw vehicle body (COCO Car)
            vw, vh = 140, 80
            cv2.rectangle(frame, (cur_x, cur_y), (cur_x + vw, cur_y + vh), (180, 80, 50), -1)

            # Draw license plate on car
            pw, ph = 80, 22
            px = cur_x + (vw - pw) // 2
            py = cur_y + vh - ph - 6
            cv2.rectangle(frame, (px, py), (px + pw, py + ph), (230, 230, 230), -1)
            cv2.putText(frame, v["plateText"], (px + 4, py + 16), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (10, 10, 10), 1)

        out.write(frame)

    out.release()
    return video_path


def run_video_evaluation():
    print("[VideoEval] Running video pipeline evaluation on 5 traffic clips...")

    clips_gt = [
        {"id": 1, "name": "Coimbatore Junction North", "vehicles": [
            {"id": "V1", "plateText": "TN37CZ1024", "startX": 50, "startY": 100, "dx": 4.0, "dy": 0.5},
            {"id": "V2", "plateText": "KA04MH9981", "startX": 300, "startY": 200, "dx": -3.5, "dy": 0.8}
        ]},
        {"id": 2, "name": "Avinashi Road Highway", "vehicles": [
            {"id": "V3", "plateText": "KL07BH4420", "startX": 100, "startY": 120, "dx": 5.0, "dy": 0.0},
            {"id": "V4", "plateText": "MH12PQ3001", "startX": 250, "startY": 220, "dx": -4.0, "dy": -0.3}
        ]},
        {"id": 3, "name": "Trichy Road Intersection", "vehicles": [
            {"id": "V5", "plateText": "DL03CC8812", "startX": 80, "startY": 150, "dx": 3.8, "dy": 0.4},
            {"id": "V6", "plateText": "22BH9088AB", "startX": 320, "startY": 180, "dx": -3.2, "dy": 0.6}
        ]},
        {"id": 4, "name": "Gandhipuram Flyover Entry", "vehicles": [
            {"id": "V7", "plateText": "AP16TF5543", "startX": 60, "startY": 80, "dx": 4.5, "dy": 1.0},
            {"id": "V8", "plateText": "HR26DQ7711", "startX": 280, "startY": 240, "dx": -4.2, "dy": -0.5}
        ]},
        {"id": 5, "name": "Ukkadam Lake Bypass", "vehicles": [
            {"id": "V9", "plateText": "WB02AE6600", "startX": 120, "startY": 140, "dx": 3.9, "dy": 0.2},
            {"id": "V10", "plateText": "GJ01XY4321", "startX": 310, "startY": 190, "dx": -3.6, "dy": 0.4}
        ]}
    ]

    detector = ANPRDetector()
    ocr_engine = ANPROCR()

    eval_results = []
    total_vehicles_eval = 0
    single_frame_correct = 0
    consensus_correct = 0

    for clip_info in clips_gt:
        cid = clip_info["id"]
        cname = clip_info["name"]
        gt_vehs = clip_info["vehicles"]

        video_path = create_mock_traffic_video(cid, gt_vehs)
        annotated_path = os.path.join(VIDEO_DIR, f"annotated_clip_{cid:02d}.mp4")

        cap = cv2.VideoCapture(video_path)
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps_in = cap.get(cv2.CAP_PROP_FPS)

        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out_writer = cv2.VideoWriter(annotated_path, fourcc, fps_in, (w, h))

        tracker = MultiFrameConsensusTracker(history_window=15)
        frame_times = []
        frame_idx = 0

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret or frame is None:
                break

            t0 = time.time()
            frame_idx += 1

            # Run detection
            detections = detector.detect_plates(frame)

            for d_idx, det in enumerate(detections):
                crop = det["crop"]
                box = det["bbox"]

                # OCR
                ocr_res = ocr_engine.recognize_plate(crop, max_variants=1)
                track_id = f"vehicle_{d_idx+1}"

                tracker.add_frame_detection(track_id, ocr_res)
                consensus = tracker.get_consensus_plate(track_id)

                # Draw bounding box & text annotation
                x1, y1, x2, y2 = box
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                cv2.putText(frame, f"ID:{track_id} {consensus['plateText']}", (x1, max(15, y1 - 5)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

            t_elapsed = time.time() - t0
            frame_times.append(t_elapsed)

            out_writer.write(frame)

        cap.release()
        out_writer.release()

        avg_fps = round(1.0 / np.mean(frame_times) if frame_times else 0.0, 2)

        # Check vehicle consensus accuracy against ground truth
        clip_veh_count = len(gt_vehs)
        total_vehicles_eval += clip_veh_count

        # For this clip evaluation
        clip_correct = 0
        for idx_v, gv in enumerate(gt_vehs):
            tid = f"vehicle_{idx_v+1}"
            cons = tracker.get_consensus_plate(tid)
            if cons["plateText"] == gv["plateText"]:
                clip_correct += 1
                consensus_correct += 1

        single_frame_correct += clip_correct # Baseline

        acc_pct = round((clip_correct / clip_veh_count) * 100.0 if clip_veh_count else 0.0, 2)

        eval_results.append({
            "clipId": cid,
            "clipName": cname,
            "inputVideo": f"clip_{cid:02d}.mp4",
            "annotatedVideo": f"annotated_clip_{cid:02d}.mp4",
            "vehicleCount": clip_veh_count,
            "consensusPlateAccuracy": acc_pct,
            "fps": avg_fps
        })

        print(f"  Clip {cid}: {cname} | Vehicles: {clip_veh_count} | Consensus Acc: {acc_pct}% | FPS: {avg_fps}")

    overall_consensus_acc = round((consensus_correct / total_vehicles_eval) * 100.0 if total_vehicles_eval else 0.0, 2)

    video_eval_json = os.path.join(DOCS_DIR, "video_evaluation.json")
    with open(video_eval_json, "w") as f:
        json.dump({
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "totalClipsEvaluated": len(clips_gt),
            "totalVehiclesEvaluated": total_vehicles_eval,
            "overallConsensusAccuracy": overall_consensus_acc,
            "clipResults": eval_results
        }, f, indent=2)

    print(f"[VideoEval] Video evaluation finished! Overall Consensus Accuracy: {overall_consensus_acc}%. Results written to {video_eval_json}")
    return eval_results


if __name__ == "__main__":
    run_video_evaluation()
