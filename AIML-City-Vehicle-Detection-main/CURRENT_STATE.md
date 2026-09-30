# Current State of NetraTrack Repository

**Date**: 2026-09-29  
**Target Problem Statement**: BEL SIH 26127 - City-Wide AI Engine for Multi-Camera ANPR Trajectory Tracking and Urban Traffic Analytics  
**Overall Completion**: ~70% Core Architecture Built (Requires Optimization, Security Integration, Ingestion Worker, and Feature Completion)

---

## 🟢 What Works & Is Implemented

1. **GIS Single-Plate Trajectory Tracker**:
   - Leaflet interactive map rendering camera nodes, vehicle timeline, and scrubber.
   - Route inference via Dijkstra shortest-path algorithm on `RoadGraph`.
   - Fuzzy plate search using Levenshtein distance fallback.
   - CSV export for vehicle sighting logs.

2. **Macro Urban Traffic Analytics**:
   - MongoDB aggregation pipelines for vehicle density per camera/junction.
   - Origin-Destination (O-D) matrix generation.
   - Congestion bottleneck calculation with Level of Service (LoS) grading (A to F).
   - Hourly flow trend visualizations.

3. **Real-Time Anomaly & Security Alert Engine**:
   - In-memory rule engine evaluating detection events.
   - Rule checks: Impossible Speed / Plate Cloning (>160 km/h), Wrong-Way Corridor Travel, Loitering (>= 3 hits in 15 mins), Watchlist/Blacklist hits.
   - Socket.IO real-time alert broadcasting to client dashboard.

4. **Multi-Camera Traffic Simulator**:
   - Node.js simulator pushing synthetic detection events for 30 Coimbatore camera locations with injected anomaly scenarios.

5. **Preprocessing & ANPR Visualizer UI**:
   - ANPR Lab page illustrating CLAHE low-light enhancement, image deskewing, unsharp masking, and Indian plate grammar post-processing rules.

---

## 🔴 What Doesn't Work / Is Incomplete

1. **ANPR / OCR Accuracy Target Not Met (Target > 90%)**:
   - Untouched original real photos: **64.00%** exact match.
   - Augmented real photos: **58.00%** exact match.
   - Dirty plate subset: **44.44%** exact match.
   - Video multi-frame consensus: **40.00%** accuracy.
   - YOLOv8 detector uses generic public weights without custom Indian plate fine-tuning. EasyOCR lacks fine-tuning on Indian plate fonts/layouts.

2. **Security, RBAC, Audit, & Retention (Phase 2)**:
   - `User` and `AuditLog` Mongoose models exist but are unlinked.
   - No `/api/auth` endpoints (register/login/JWT tokens).
   - No RBAC middleware (`requireRole`).
   - No audit middleware logging queries, watchlist edits, or logins.
   - No Login UI page or Audit Log viewer in React client.
   - No TTL index on `DetectionEvent` collection for automatic retention.
   - Hardcoded secrets and missing Helmet/CORS restrictions/rate limiting.

3. **Docker Compose & Cross-Platform Orchestration (Phase 3)**:
   - Missing production Dockerfiles for client and server (multi-stage build with Nginx proxy).
   - `start.js` hardcodes PowerShell (`powershell -Command`) and Windows `py` executable.
   - Missing container healthchecks and seeded admin user credentials.

4. **Real Video Ingestion Pipeline (Phase 4)**:
   - Live stream currently depends entirely on simulator.
   - Ingestion worker for real video clips (`data/video_dataset`) or RTSP URLs is not implemented.
   - Missing Camera Admin toggle between Simulator and Video/RTSP sources.

5. **Fallback for Unreadable Plates (Phase 5)**:
   - No vehicle appearance extraction (color histogram, vehicle type, Re-ID embedding).
   - No spatio-temporal route fallback for unreadable/missing plates on the map (dashed fallback polyline).

6. **Analytics Completeness & Forecasts (Phase 6)**:
   - Missing congestion forecasting (short-term trend / moving average).
   - Missing predicted-next-camera feature for active tracked vehicles.
   - Missing PDF report export for trajectory and analytics.

7. **Tests, CI/CD, & Submission Package (Phase 7)**:
   - Unit and integration tests for Auth, ANPR, Anomaly, and Trajectory are incomplete/missing.
   - No GitHub Actions CI pipeline.
   - `docs/SIH_SUBMISSION.md` not yet created.

---

## 📋 Execution Plan (In Order)

- **Phase 1**: Fix OCR Accuracy (Dataset build script, YOLO fine-tuning, OCR engine benchmarking & fine-tuning, grammar post-processor enhancements, ablation & evaluation generation).
- **Phase 2**: Security, RBAC, Audit, Retention (Auth API, RBAC middleware, Audit logging, Client Login & Audit UI, TTL index, security headers).
- **Phase 3**: Docker & Cross-Platform Run (Dockerfiles, Nginx proxy, cross-platform launcher, healthchecks, seed script).
- **Phase 4**: Real Video Ingestion Pipeline (Video/RTSP worker, multi-camera mapping, camera source toggle).
- **Phase 5**: Fallback for Unreadable Plates (Color/type Re-ID feature, spatio-temporal graph matcher, map fallback rendering).
- **Phase 6**: Analytics Completeness (Congestion forecasting, next-camera prediction, PDF export).
- **Phase 7**: Quality, Tests, Docs, & Submission (Unit/Integration tests, CI pipeline, documentation sync, SIH submission artifact).
