# NetraTrack Indian License Plate Dataset Specifications & Provenance

**Dataset Version**: 2.0 (SIH-26127 Enterprise Release)  
**Total Distinct Plates**: `2400`  
**Group-Based Split Guarantee**: No plate string or crop augmentation appears in more than one split (Train / Val / Test).

---

## 📊 Dataset Summary

| Split Name | Distinct Plate Count | Percent | Purpose |
|---|---|---|---|
| **Train** | `1920` | 80.0% | YOLOv8 detector & OCR recognizer fine-tuning |
| **Validation** | `240` | 10.0% | Hyperparameter tuning & early stopping |
| **Test (Held-Out)** | `240` | 10.0% | Strict evaluation & benchmarking (Untouched & Augmented) |

---

## 🏷 Plate Formats & Grammar Distribution

- **Standard State Formats** (`TN37AB1234`, `KA01EF5678`, `MH12CD9012`): All 37 Indian State and UT codes.
- **BH-Series Formats** (`22BH9876AA`): 2-digit year + `BH` + 4-digit sequence + 2-letter series.
- **Two-Row Plates (Two-Wheelers / Commercial)**: 2-line stacked layouts with top line state/district and bottom line series/number.
- **Commercial & Electric Vehicles**: High contrast yellow and green background overlays.

---

## 🌧 Environmental Augmentations Applied

1. **Natural Daylight**: High contrast, crisp strokes.
2. **Night Vision & Headlight Glare**: Low intensity (0.35x) with headlight vignette.
3. **Rain & Splash Streak**: Vertical water drop streaks and minor diffusion.
4. **Motion Blur**: 5x5 to 9x9 directional motion kernels.
5. **Perspective Shear Angle**: Perspective transformation matrices simulating 15°-30° camera angles.
6. **Dirty Mud Smudges**: Dark mud ellipses obscuring critical character strokes.
7. **JPEG Compression Noise**: Low quality factor JPEG encoding (Q15-Q40).

---

## 📜 Licenses & Provenance

- **Primary Source**: Synthetic & Augmented Indian Plate Generator (NetraTrack Engine) combining Kaggle Indian License Plates labels, Roboflow Universe Open ALPR datasets, and Indian RTO Registration standards.
- **License**: Creative Commons Attribution 4.0 International (CC-BY-4.0) & MIT License.
- **Data Integrity**: Verified zero leakage between training set and held-out evaluation benchmarks.
