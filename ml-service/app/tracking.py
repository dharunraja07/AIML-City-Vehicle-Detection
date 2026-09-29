import time
from collections import defaultdict
from typing import List, Dict, Any, Tuple, Optional

class MultiFrameConsensusTracker:
    def __init__(self, history_window: int = 15, max_inactive_sec: float = 30.0):
        # track_id -> List[Dict] with { rawPlateText, correctedPlateText, confidence, charConfidences, isValid, timestamp }
        self.tracks = defaultdict(list)
        self.track_last_seen = {}
        self.history_window = history_window
        self.max_inactive_sec = max_inactive_sec

    def add_frame_detection(self, track_id: str, ocr_result: Dict[str, Any], timestamp: float = None):
        """Accumulates OCR detections across video frames for a tracked vehicle."""
        if not track_id or not ocr_result:
            return

        if timestamp is None:
            timestamp = time.time()

        ocr_result["timestamp"] = timestamp
        self.tracks[track_id].append(ocr_result)
        self.track_last_seen[track_id] = timestamp

        # Enforce rolling history window per track
        if len(self.tracks[track_id]) > self.history_window:
            self.tracks[track_id].pop(0)

        # Evict stale/finished tracks to prevent unbounded memory growth
        self.evict_stale_tracks(current_time=timestamp)

    def get_consensus_plate(self, track_id: str) -> Dict[str, Any]:
        """Calculates confidence-weighted consensus plate string across multi-frame sequence."""
        history = self.tracks.get(track_id, [])
        if not history:
            return {
                "plateText": "",
                "rawPlateText": "",
                "consensusConfidence": 0.0,
                "frameCount": 0,
                "isValid": False,
                "stateCode": "",
                "plateType": "UNKNOWN"
            }

        candidate_scores = defaultdict(float)
        candidate_details = {}

        for item in history:
            plate = item.get("correctedPlateText")
            if not plate:
                continue
            conf = item.get("overallConfidence", 0.5)

            # Bonus score for valid Indian plate structure
            valid_bonus = 1.3 if item.get("isValid", False) else 0.8
            score = conf * valid_bonus

            candidate_scores[plate] += score
            candidate_details[plate] = item

        if not candidate_scores:
            return {
                "plateText": "",
                "rawPlateText": "",
                "consensusConfidence": 0.0,
                "frameCount": len(history),
                "isValid": False,
                "stateCode": "",
                "plateType": "UNKNOWN"
            }

        # Pick candidate string with highest accumulated confidence score
        best_plate = max(candidate_scores.keys(), key=lambda p: candidate_scores[p])
        best_detail = candidate_details[best_plate]

        total_score = sum(candidate_scores.values())
        consensus_conf = min(0.99, candidate_scores[best_plate] / total_score if total_score > 0 else 0.80)

        return {
            "plateText": best_plate,
            "rawPlateText": best_detail.get("rawPlateText", best_plate),
            "consensusConfidence": round(float(consensus_conf), 2),
            "frameCount": len(history),
            "isValid": best_detail.get("isValid", True),
            "stateCode": best_detail.get("stateCode", ""),
            "plateType": best_detail.get("plateType", "STANDARD")
        }

    def evict_stale_tracks(self, current_time: float = None):
        """Evict inactive tracks exceeding max_inactive_sec to prevent memory leaks."""
        if current_time is None:
            current_time = time.time()

        stale_ids = [
            tid for tid, last_seen in self.track_last_seen.items()
            if (current_time - last_seen) > self.max_inactive_sec
        ]

        for tid in stale_ids:
            if tid in self.tracks:
                del self.tracks[tid]
            if tid in self.track_last_seen:
                del self.track_last_seen[tid]

    def clear(self):
        self.tracks.clear()
        self.track_last_seen.clear()
