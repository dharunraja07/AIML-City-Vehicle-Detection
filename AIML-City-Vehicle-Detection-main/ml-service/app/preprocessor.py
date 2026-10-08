import cv2
import numpy as np
import base64
from typing import Dict, Any, Tuple

def apply_clahe(img_gray: np.ndarray, clip_limit: float = 3.0, tile_grid_size: tuple = (8, 8)) -> np.ndarray:
    """Enhance low-light and night imagery using CLAHE."""
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile_grid_size)
    return clahe.apply(img_gray)

def sharpen_image(img_gray: np.ndarray) -> np.ndarray:
    """Apply Unsharp Masking for deblurring motion-blurred plates."""
    gaussian = cv2.GaussianBlur(img_gray, (0, 0), 2.0)
    return cv2.addWeighted(img_gray, 1.5, gaussian, -0.5, 0)

def denoise_image(img_gray: np.ndarray) -> np.ndarray:
    """Denoise license plate crop using Bilateral Filtering while preserving character edges."""
    return cv2.bilateralFilter(img_gray, 9, 75, 75)

def deskew_plate(img_crop: np.ndarray) -> np.ndarray:
    """Deskew angled license plates using contour rotated bounding box."""
    if len(img_crop.shape) == 3:
        gray = cv2.cvtColor(img_crop, cv2.COLOR_BGR2GRAY)
    else:
        gray = img_crop

    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    contours, _ = cv2.findContours(thresh, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    if not contours:
        return img_crop

    largest_cnt = max(contours, key=cv2.contourArea)
    rect = cv2.minAreaRect(largest_cnt)
    angle = rect[-1]

    if angle < -45:
        angle = -(90 + angle)
    else:
        angle = -angle

    if abs(angle) < 2.0 or abs(angle) > 45.0:
        return img_crop

    (h, w) = img_crop.shape[:2]
    center = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(center, angle, 1.0)
    rotated = cv2.warpAffine(img_crop, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    return rotated

def cv2_to_b64(img: np.ndarray) -> str:
    """Convert OpenCV image array to base64 data URL."""
    if img is None or img.size == 0:
        return ""
    success, encoded = cv2.imencode('.png', img)
    if not success:
        return ""
    b64_str = base64.b64encode(encoded.tobytes()).decode('utf-8')
    return f"data:image/png;base64,{b64_str}"

def preprocess_plate_with_stages(img_crop: np.ndarray) -> Tuple[np.ndarray, Dict[str, str]]:
    """Runs full preprocessing pipeline and returns (final_processed_gray, dict_of_stage_base64_urls)."""
    if img_crop is None or img_crop.size == 0:
        return img_crop, {}

    # 1. Deskew
    deskewed = deskew_plate(img_crop)

    # 2. Convert to Grayscale
    if len(deskewed.shape) == 3:
        gray = cv2.cvtColor(deskewed, cv2.COLOR_BGR2GRAY)
    else:
        gray = deskewed

    # 3. CLAHE
    clahe_img = apply_clahe(gray)

    # 4. Sharpening & Denoising
    sharpened = sharpen_image(clahe_img)
    denoised = denoise_image(sharpened)

    # 5. Otsu thresholding
    _, thresholded = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    stages = {
        "crop": cv2_to_b64(img_crop),
        "deskewed": cv2_to_b64(deskewed),
        "clahe": cv2_to_b64(clahe_img),
        "thresholded": cv2_to_b64(thresholded)
    }

    return denoised, stages

def preprocess_plate_for_ocr(img_crop: np.ndarray) -> np.ndarray:
    denoised, _ = preprocess_plate_with_stages(img_crop)
    return denoised
