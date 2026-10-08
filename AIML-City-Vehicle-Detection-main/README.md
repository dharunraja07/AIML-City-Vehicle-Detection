# NetraTrack (BEL SIH Problem Statement 26127)
> **Tagline**: *One city, every camera, one trajectory.*  
> **Problem Statement**: City-Wide AI Engine for Multi-Camera ANPR Trajectory Tracking and Urban Traffic Analytics (Bharat Electronics Limited - BEL)

---

## 📌 Executive Summary & BEL Requirement Mapping

| BEL Problem Statement 26127 Requirement | NetraTrack Solution Module | Status |
| :--- | :--- | :---: |
| **High-Accuracy ANPR/OCR Engine** (>90% accuracy on Indian plates, hard conditions) | FastAPI ANPR Engine with YOLOv8 license plate detector (pre-trained public weights downloaded from open-source ALPR repo; not fine-tuned in-house), vehicle type classifier, CLAHE enhancement, deskewing, Indian position-aware character repair, & ByteTrack consensus. | ⚠️ **93.94% Char Acc (Clean/Day) / 58.00% Exact Match (Augmented Real) / 64.00% (Untouched Original) - Target 90% Exact Match Not Met** |
| **Single-Plate Trajectory Tracking on GIS Map** | Node.js Trajectory Engine with Levenshtein OCR fuzzy matching, Dijkstra shortest-path route inference, & interactive Leaflet timeline scrubber playback. | ✅ **Implemented & Verified** |
| **Macro Traffic Flow & Urban Analytics** | MongoDB time-series aggregations computing vehicle density, Origin-Destination (O-D) matrix, congestion bottlenecks (Level of Service A-F), & hourly flow trends. | ✅ **Implemented & Verified** |
| **Real-Time Security Alert System** | Rule engine detecting Plate Cloning (Impossible Speed > 160 km/h), Wrong-Way travel, Loitering, Watchlist matches, & operator action workflows. | ✅ **Implemented & Verified** |
| **City-Wide Camera Network & Traffic Simulator** | Node.js traffic simulator generating 200+ live vehicles across 30 Coimbatore junctions with injected security scenarios & OCR noise. | ✅ **Implemented & Verified** |

---

## 🏗 Repository Structure

```
/ (d:\CCTV control)
├── docker-compose.yml       # One-command orchestration
├── .env.example             # Environment config template
├── README.md                # System documentation & demo guide
├── client/                  # React + Vite + Tailwind Control Room Dashboard
├── server/                  # Node.js + Express + Socket.IO + Mongoose Backend
├── ml-service/              # FastAPI ANPR engine + preprocessor + evaluation harness
├── simulator/               # 30-camera traffic network & scenario simulator
├── data/                    # Seed cameras.json, road_graph.json, & watchlist.json
└── docs/                    # Architecture diagrams, API docs, & evaluation report
```

---

## ⚡ Quick Start Guide (One-Command Launch)

### Option 1: Docker Compose (Recommended)
```bash
docker-compose up --build
```
Access points:
- **Control Room Dashboard**: `http://localhost:5173` (or `http://localhost:5000`)
- **Express Backend API**: `http://localhost:5000/api/health`
- **FastAPI ML Service**: `http://localhost:8000/docs`

### Option 2: Local Development Mode

1. **Download ML Models**:
   ```bash
   cd ml-service
   py scripts/download_models.py
   ```

2. **Start Python ANPR ML Service**:
   ```bash
   cd ml-service
   py -m pip install -r requirements.txt
   py main.py
   ```

3. **Start Node Backend Services & Client**:
   ```bash
   node start.js
   ```

---

## 🎬 3-Minute Pitch Demo Script for Hackathon Judges

1. **Step 1: Open Command Center (`http://localhost:5173`)**:
   - Point out the 30 camera nodes in Coimbatore on the dark GIS map.
   - Show live counters (Vehicles Detected Today, Active Cameras, Security Alerts, Avg Speed).
   - Watch live camera detection events streaming in real time via Socket.IO.
2. **Step 2: Trigger "Run 3-Min Demo" Button**:
   - Show stolen vehicle `TN37AB1234` triggering a `CRITICAL WATCHLIST MATCH` alert.
   - Show cloned plate `TN38XY9999` appearing simultaneously at distant cameras within 2 minutes, firing an `IMPOSSIBLE SPEED (PLATE CLONING)` alert.
   - Show wrong-way vehicle on flyover firing a `WRONG WAY` alert.
3. **Step 3: Single-Plate Trajectory Tracker**:
   - Click on plate `TN37AB1234` or type into search box.
   - Show numbered chronological sightings on Leaflet map.
   - Move timeline scrubber to replay vehicle movement step-by-step across the city.
   - Click "Export CSV" to demonstrate law-enforcement report export.
4. **Step 4: ANPR & OCR Lab & Evaluation Report**:
   - Navigate to **ANPR Lab** to view stage-by-stage pre-processing (CLAHE low-light, sharpening, deskew) & Indian character repair.
   - Navigate to **ANPR Evaluation** tab to show live evaluated accuracy metrics & confusion matrix fetched from `eval_results.json`.

---

## 🔒 Privacy & Security Policy (Surveillance Compliance)

1. **Role-Based Access Control (RBAC)**: Admin, Operator, and Viewer roles with JWT tokens.
2. **Audit Logging**: Every single plate query, watchlist addition, and alert resolution is logged in `AuditLog` collection with timestamp, operator ID, and IP address.
3. **Data Retention**: Detection events automatically expire after configurable retention period (default 90 days).
4. **No Raw Plate Logs**: Client-side console logging of license plates is strictly sanitized to prevent data leakage.
