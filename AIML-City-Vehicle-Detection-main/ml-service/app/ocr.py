import os
import cv2
import numpy as np
import re
import logging
from collections import defaultdict
from typing import Dict, Any, List, Tuple, Optional
import torch

from app.preprocessor import preprocess_plate_with_stages, apply_clahe, sharpen_image, denoise_image
from app.postprocessor import post_process_indian_plate, normalize_text

logger = logging.getLogger("netratrack.ocr")

MODEL_PATH = os.path.normpath(os.path.join(os.path.dirname(__file__), "../models/indian_crnn_ocr.pt"))

CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
IDX_TO_CHAR = {i + 1: c for i, c in enumerate(CHARSET)}


class ANPROCR:
    def __init__(self):
        self.reader = None
        self.crnn_model = None
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self._init_ocr_engine()
        self._init_crnn_engine()

    def _init_ocr_engine(self):
        """Initialize EasyOCR engine."""
        try:
            import easyocr
            self.reader = easyocr.Reader(['en'], gpu=False, verbose=False)
            logger.info("Successfully initialized EasyOCR engine.")
        except Exception as e:
            logger.warning(f"EasyOCR initialization failed: {e}.")
            self.reader = None

    def _init_crnn_engine(self):
        """Initialize fine-tuned PyTorch Indian CRNN engine."""
        try:
            from scripts.train_ocr_recognizers import CRNNOCR
            if os.path.exists(MODEL_PATH):
                model = CRNNOCR(num_classes=len(CHARSET) + 1).to(self.device)
                model.load_state_dict(torch.load(MODEL_PATH, map_location=self.device))
                model.eval()
                self.crnn_model = model
                logger.info(f"Successfully loaded Indian CRNN OCR model from {MODEL_PATH}")
            else:
                logger.warning(f"CRNN model weights not found at {MODEL_PATH}")
        except Exception as e:
            logger.warning(f"Failed to load Indian CRNN OCR model: {e}")
            self.crnn_model = None

    def _upscale_crop(self, crop: np.ndarray, factor: float = 3.0) -> np.ndarray:
        """Bicubic upscaling for small license plate crops to enhance OCR character resolution."""
        if crop is None or crop.size == 0:
            return crop
        h, w = crop.shape[:2]
        if h < 140 or w < 450:
            new_w = int(w * factor)
            new_h = int(h * factor)
            return cv2.resize(crop, (new_w, new_h), interpolation=cv2.INTER_CUBIC)
        return crop

    def recognize_crnn(self, crop: np.ndarray) -> Tuple[str, List[float]]:
        """Runs PyTorch Indian CRNN inference on plate crop."""
        if self.crnn_model is None or crop is None or crop.size == 0:
            return "", []

        if len(crop.shape) == 3 and crop.shape[2] == 3:
            gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        else:
            gray = crop

        resized = cv2.resize(gray, (160, 64), interpolation=cv2.INTER_CUBIC)
        norm = resized.astype(np.float32) / 255.0
        norm = (norm - 0.5) / 0.5
        tensor = torch.tensor(norm, dtype=torch.float32).unsqueeze(0).unsqueeze(0).to(self.device)

        with torch.no_grad():
            logits = self.crnn_model(tensor)  # [1, W, C]
            probs = torch.softmax(logits, dim=-1)
            conf_vals, preds = torch.max(probs, dim=-1)

            seq = preds[0].cpu().numpy()
            confs = conf_vals[0].cpu().numpy()

            decoded_text = ""
            char_confs = []
            prev = 0
            for idx, p in enumerate(seq):
                if p != 0 and p != prev:
                    char_str = IDX_TO_CHAR.get(p, '')
                    if char_str:
                        decoded_text += char_str
                        char_confs.append(round(float(confs[idx]), 2))
                prev = p

        return decoded_text, char_confs

    def recognize_plate(self, crop: np.ndarray, max_variants: int = 5, engine: str = "ensemble") -> Dict[str, Any]:
        """Recognizes text from a license plate crop image using Indian CRNN, EasyOCR, or Ensemble."""
        if crop is None or crop.size == 0:
            return {
                "rawPlateText": "",
                "correctedPlateText": "",
                "charConfidences": [],
                "overallConfidence": 0.0,
                "isValid": False,
                "stateCode": "",
                "plateType": "INVALID",
                "stages": {}
            }

        # Step 1: Upscale small crop (Bicubic x3)
        upscaled_crop = self._upscale_crop(crop, factor=3.0)
        preprocessed, stages = preprocess_plate_with_stages(upscaled_crop)

        # Handle 2-row license plates
        h, w = preprocessed.shape[:2]
        aspect_ratio = float(w) / float(h) if h > 0 else 3.0

        if aspect_ratio < 2.3:
            mid = h // 2
            top_crop = preprocessed[0:mid, :]
            bot_crop = preprocessed[mid:h, :]

            raw_top, confs_top = self._ocr_single_image(top_crop, engine=engine)
            raw_bot, confs_bot = self._ocr_single_image(bot_crop, engine=engine)

            raw_text = normalize_text(raw_top + raw_bot)
            char_confs = confs_top + confs_bot
            processed = post_process_indian_plate(raw_text)
            overall_conf = round(float(np.mean(char_confs)), 2) if char_confs else 0.0

            return {
                "rawPlateText": raw_text,
                "correctedPlateText": processed["correctedPlateText"],
                "charConfidences": char_confs,
                "overallConfidence": overall_conf,
                "isValid": processed["isValid"],
                "stateCode": processed.get("stateCode", ""),
                "plateType": processed.get("plateType", "UNKNOWN"),
                "stages": stages
            }

        # TTA Variants
        tta_variants = self._generate_tta_variants(preprocessed, max_variants=max_variants)

        variant_candidates = []
        for v_img in tta_variants:
            r_text, r_confs = self._ocr_single_image(v_img, engine=engine)
            post_res = post_process_indian_plate(r_text)
            conf = float(np.mean(r_confs)) if r_confs else 0.5
            variant_candidates.append({
                "rawText": r_text,
                "correctedText": post_res["correctedPlateText"],
                "conf": conf,
                "charConfs": r_confs,
                "isValid": post_res["isValid"],
                "stateCode": post_res.get("stateCode", ""),
                "plateType": post_res.get("plateType", "UNKNOWN")
            })

        best_variant = self._vote_tta_candidates(variant_candidates)

        return {
            "rawPlateText": best_variant["rawText"],
            "correctedPlateText": best_variant["correctedText"],
            "charConfidences": best_variant["charConfs"],
            "overallConfidence": round(best_variant["conf"], 2),
            "isValid": best_variant["isValid"],
            "stateCode": best_variant["stateCode"],
            "plateType": best_variant["plateType"],
            "stages": stages
        }

    def _generate_tta_variants(self, img_gray: np.ndarray, max_variants: int = 5) -> List[np.ndarray]:
        variants = [img_gray]
        if max_variants <= 1:
            return variants

        clahe2 = apply_clahe(img_gray, clip_limit=4.0)
        variants.append(clahe2)
        if max_variants <= 2:
            return variants

        sharp = sharpen_image(img_gray)
        variants.append(sharp)
        if max_variants <= 3:
            return variants

        adaptive = cv2.adaptiveThreshold(img_gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2)
        variants.append(adaptive)
        if max_variants <= 4:
            return variants

        _, otsu = cv2.threshold(img_gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        variants.append(otsu)

        return variants[:max_variants]

    def _vote_tta_candidates(self, candidates: List[Dict[str, Any]]) -> Dict[str, Any]:
        if not candidates:
            return {
                "rawText": "", "correctedText": "", "conf": 0.0,
                "charConfs": [], "isValid": False, "stateCode": "", "plateType": "INVALID"
            }

        scores = defaultdict(float)
        cand_map = {}

        for c in candidates:
            cand_str = c["correctedText"]
            if not cand_str:
                continue

            score = c["conf"]
            if c["isValid"]:
                score += 1.5

            scores[cand_str] += score
            if cand_str not in cand_map or c["conf"] > cand_map[cand_str]["conf"]:
                cand_map[cand_str] = c

        if not scores:
            return candidates[0]

        best_cand_str = max(scores.keys(), key=lambda k: scores[k])
        return cand_map[best_cand_str]

    def _ocr_single_image(self, img_gray: np.ndarray, engine: str = "ensemble") -> Tuple[str, List[float]]:
        if img_gray is None or img_gray.size == 0:
            return "", []

        # 1. Custom Indian CRNN CTC recognizer
        if engine in ("indian_crnn", "ensemble") and self.crnn_model is not None:
            crnn_text, crnn_confs = self.recognize_crnn(img_gray)
            if engine == "indian_crnn" or (crnn_text and len(crnn_text) >= 7):
                return crnn_text, crnn_confs

        # 2. EasyOCR
        if self.reader is not None:
            try:
                results = self.reader.readtext(img_gray, allowlist='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')
                if results:
                    full_text = ""
                    char_confs = []
                    for res in results:
                        text = res[1]
                        conf = float(res[2])
                        clean_seg = normalize_text(text)
                        full_text += clean_seg
                        for _ in clean_seg:
                            char_confs.append(round(conf, 2))
                    return full_text, char_confs
            except Exception as e:
                logger.error(f"EasyOCR read error: {e}")

        return "", []
