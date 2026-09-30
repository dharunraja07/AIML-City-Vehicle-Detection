# NetraTrack REST API Reference

All API requests are served relative to `http://localhost:5000/api`.

---

## 1. Events API

### `POST /api/events`
Ingest a single camera detection event.
**Request Body**:
```json
{
  "eventId": "EVT-12345",
  "plateText": "TN37AB1234",
  "rawPlateText": "TN37AB123O",
  "confidence": 0.95,
  "cameraId": "CAM-CBE-001",
  "vehicleType": "CAR",
  "timestamp": "2026-09-29T12:00:00Z"
}
```

### `POST /api/events/batch`
Ingest an array of detection events.

### `GET /api/events/recent?limit=50&page=1`
Fetch recent detection event stream.

### `GET /api/events/stats`
Fetch live dashboard KPIs (vehicles today, active cameras, open alerts, avg city speed).

---

## 2. Trajectory API

### `GET /api/trajectory/:plate?from=&to=`
Fetch full chronological trajectory, derived speed/distance segments, and Dijkstra route polyline for a vehicle.

### `GET /api/trajectory/co-occurrence/search?camA=&camB=&windowMins=30`
Fetch vehicles detected at both Camera A and Camera B within specified time window.

### `GET /api/trajectory/last-seen/:plate`
Quick lookup of vehicle's most recent sighting.

---

## 3. Analytics API

### `GET /api/analytics/density?window=15`
Fetch vehicle density (vehicles/min) per camera & per zone.

### `GET /api/analytics/od-matrix`
Fetch Origin-Destination matrix and top trip corridors.

### `GET /api/analytics/bottlenecks`
Fetch urban congestion bottlenecks with Level of Service (LOS A to F) ratings.

### `GET /api/analytics/trends`
Fetch 24-hour hourly flow trends and vehicle class mix.

---

## 4. Alerts & Watchlist API

### `GET /api/alerts?status=&severity=&type=`
Fetch security alerts feed with filters.

### `PUT /api/alerts/:id/status`
Update alert status (`NEW` -> `ACKNOWLEDGED` -> `RESOLVED` / `FALSE_POSITIVE`).

### `GET /api/watchlist`
Fetch active blacklisted vehicles.

### `POST /api/watchlist`
Add a vehicle to blacklist watchlist.

### `DELETE /api/watchlist/:id`
Deactivate a blacklisted vehicle.

---

## 5. ANPR ML Service API (Python FastAPI - Port 8000)

### `POST http://localhost:8000/anpr/image`
Upload image file to run plate detector, CLAHE/deskew preprocessor, OCR, and Indian post-processor.

### `POST http://localhost:8000/anpr/video`
Process video frame and update multi-frame ByteTrack consensus sequence tracker.
