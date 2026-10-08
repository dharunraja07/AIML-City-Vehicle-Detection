const Camera = require('../models/Camera');
const DetectionEvent = require('../models/DetectionEvent');
const Alert = require('../models/Alert');
const watchlistService = require('./watchlistService');
const anomalyService = require('./anomalyService');
const { correctIndianPlate, normalizePlateText } = require('../utils/indianPlateValidator');

class IngestionService {
  constructor() {
    this.recentDedupeCache = new Map();
    this.cameraCache = new Map();
    this.lastCameraCacheTime = 0;
  }

  async refreshCameraCache() {
    try {
      const cameras = await Camera.find({});
      this.cameraCache.clear();
      cameras.forEach(cam => this.cameraCache.set(cam.cameraId, cam));
      this.lastCameraCacheTime = Date.now();
    } catch (err) {
      console.error('[IngestionService] Error fetching cameras:', err);
    }
  }

  async processEvent(rawEvent, io) {
    if (Date.now() - this.lastCameraCacheTime > 60000) {
      await this.refreshCameraCache();
    }

    const rawPlate = rawEvent.rawPlateText || rawEvent.plateText || '';
    const { corrected: plateText, isValid: isValidPlate } = correctIndianPlate(rawPlate);

    if (!plateText || plateText.length < 5) {
      return { status: 'REJECTED', reason: 'Invalid or too short plate text' };
    }

    const cameraId = rawEvent.cameraId || 'CAM-CBE-001';
    const timestamp = rawEvent.timestamp ? new Date(rawEvent.timestamp) : new Date();

    // 1. Deduplication check (3 second sliding window)
    const dedupeKey = `${plateText}_${cameraId}`;
    const lastSeenTime = this.recentDedupeCache.get(dedupeKey);
    if (lastSeenTime && (timestamp.getTime() - lastSeenTime) < 3000) {
      return { status: 'DEDUPLICATED', plateText, cameraId };
    }
    this.recentDedupeCache.set(dedupeKey, timestamp.getTime());

    // 2. Camera & Spatial Coordinates Lookup
    const camera = this.cameraCache.get(cameraId);
    const location = camera ? camera.location : (rawEvent.location || { type: 'Point', coordinates: [76.9656, 11.0168] });
    const direction = rawEvent.direction || (camera ? camera.direction : 'NB');

    // 3. Watchlist Matching
    const watchlistResult = await watchlistService.checkPlate(plateText);
    const isWatchlistMatch = watchlistResult.matched;

    // 4. Create Detection Event Document
    const eventId = rawEvent.eventId || `EVT-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
    const eventDoc = new DetectionEvent({
      eventId,
      plateText,
      rawPlateText: normalizePlateText(rawPlate),
      confidence: typeof rawEvent.confidence === 'number' ? rawEvent.confidence : 0.95,
      charConfidences: rawEvent.charConfidences || [],
      cameraId,
      location,
      timestamp,
      direction,
      laneId: rawEvent.laneId || 1,
      vehicleType: rawEvent.vehicleType || 'CAR',
      speedEstimate: rawEvent.speedEstimate || Math.floor(Math.random() * 20 + 40),
      imageSnapshotUrl: rawEvent.imageSnapshotUrl || `https://picsum.photos/seed/${plateText}/320/180`,
      isValidPlate,
      isWatchlistMatch
    });

    try {
      await eventDoc.save();
    } catch (saveErr) {
      if (saveErr.code === 11000) {
        return { status: 'DUPLICATE_KEY_SKIPPED', eventId };
      }
      throw saveErr;
    }

    // 5. Watchlist Alert Triggering
    let createdAlerts = [];
    if (isWatchlistMatch) {
      const entry = watchlistResult.watchlistEntry;
      const recentSightings = await DetectionEvent.find({ plateText })
        .sort({ timestamp: -1 })
        .limit(5);

      const watchlistAlert = await Alert.create({
        alertId: `ALT-WTL-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        type: 'WATCHLIST_MATCH',
        severity: entry ? entry.priority : 'CRITICAL',
        plateText,
        cameraId,
        location,
        timestamp,
        reasonDetails: `WATCHLIST MATCH (${watchlistResult.matchType}): Vehicle ${plateText} flagged for ${entry ? entry.reason : 'WATCHLIST'}. Notes: ${entry ? entry.notes : 'N/A'}.`,
        relatedSightings: recentSightings.map(s => ({
          cameraId: s.cameraId,
          timestamp: s.timestamp,
          location: s.location,
          snapshot: s.imageSnapshotUrl
        }))
      });
      createdAlerts.push(watchlistAlert);
    }

    // 6. Anomaly Rules Evaluation
    const anomalyAlerts = await anomalyService.evaluateEvent(eventDoc, camera);
    createdAlerts = createdAlerts.concat(anomalyAlerts);

    // 7. Real-Time Socket.IO Emissions
    if (io) {
      const enrichedEvent = {
        ...eventDoc.toObject(),
        cameraName: camera ? camera.name : cameraId,
        zone: camera ? camera.zone : 'City Wide'
      };
      io.emit('detection:new', enrichedEvent);

      createdAlerts.forEach(alert => {
        io.emit('alert:new', alert);
      });
    }

    return {
      status: 'PROCESSED',
      eventId,
      plateText,
      cameraId,
      isWatchlistMatch,
      alertsCount: createdAlerts.length
    };
  }

  async processBatch(eventsArray, io) {
    const results = [];
    for (const rawEvt of eventsArray) {
      const res = await this.processEvent(rawEvt, io);
      results.push(res);
    }
    return results;
  }
}

module.exports = new IngestionService();
