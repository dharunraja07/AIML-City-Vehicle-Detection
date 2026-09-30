const Alert = require('../models/Alert');
const DetectionEvent = require('../models/DetectionEvent');
const Camera = require('../models/Camera');
const { v4: uuidv4 } = require('uuid');

/**
 * Calculates geodesic distance between two points in km (Haversine formula).
 */
function haversineDistanceKm(coords1, coords2) {
  const [lon1, lat1] = coords1;
  const [lon2, lat2] = coords2;
  const R = 6371; // Earth radius in km
  const dLat = (lat1 - lat2) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat2 * Math.PI / 180) * Math.cos(lat1 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

class AnomalyService {
  /**
   * Evaluates anomaly rules for an incoming detection event.
   * Returns array of created Alert documents.
   */
  async evaluateEvent(event, camera) {
    const alertsCreated = [];

    try {
      // Fetch last sighting of this plate
      const lastSighting = await DetectionEvent.findOne({
        plateText: event.plateText,
        eventId: { $ne: event.eventId }
      }).sort({ timestamp: -1 });

      if (lastSighting) {
        // Rule 1: IMPOSSIBLE SPEED (Possible Plate Cloning)
        const timeGapSec = (new Date(event.timestamp) - new Date(lastSighting.timestamp)) / 1000;
        if (timeGapSec > 0 && timeGapSec < 3600) { // Sighted within 1 hour
          const distanceKm = haversineDistanceKm(
            lastSighting.location.coordinates,
            event.location.coordinates
          );

          if (distanceKm > 0.5) { // At least 500m apart
            const speedKmh = (distanceKm / timeGapSec) * 3600;

            if (speedKmh > 160) { // Impossibly high speed in urban traffic
              const alert = await Alert.create({
                alertId: `ALT-SPD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                type: 'IMPOSSIBLE_SPEED',
                severity: 'CRITICAL',
                plateText: event.plateText,
                cameraId: event.cameraId,
                location: event.location,
                timestamp: event.timestamp,
                reasonDetails: `Possible Plate Cloning detected: Vehicle observed travelling at estimated ${speedKmh.toFixed(1)} km/h between ${lastSighting.cameraId} and ${event.cameraId} (${distanceKm.toFixed(2)} km in ${Math.round(timeGapSec)} seconds).`,
                relatedSightings: [
                  {
                    cameraId: lastSighting.cameraId,
                    timestamp: lastSighting.timestamp,
                    location: lastSighting.location,
                    snapshot: lastSighting.imageSnapshotUrl
                  },
                  {
                    cameraId: event.cameraId,
                    timestamp: event.timestamp,
                    location: event.location,
                    snapshot: event.imageSnapshotUrl
                  }
                ]
              });
              alertsCreated.push(alert);
            }
          }
        }
      }

      // Rule 2: WRONG-WAY TRAVEL
      // If camera is configured with strict direction and vehicle direction opposes it
      if (camera && camera.direction) {
        const opposingMap = { 'NB': 'SB', 'SB': 'NB', 'EB': 'WB', 'WB': 'EB', 'IN': 'OUT', 'OUT': 'IN' };
        if (opposingMap[camera.direction] && event.direction === opposingMap[camera.direction]) {
          const alert = await Alert.create({
            alertId: `ALT-WW-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            type: 'WRONG_WAY',
            severity: 'HIGH',
            plateText: event.plateText,
            cameraId: event.cameraId,
            location: event.location,
            timestamp: event.timestamp,
            reasonDetails: `Wrong-way travel detected: Vehicle moving ${event.direction} in ${camera.direction} designated lane/corridor at ${camera.name}.`,
            relatedSightings: [{
              cameraId: event.cameraId,
              timestamp: event.timestamp,
              location: event.location,
              snapshot: event.imageSnapshotUrl
            }]
          });
          alertsCreated.push(alert);
        }
      }

      // Rule 3: LOITERING (Repeated sightings at same camera within 15 minutes)
      const fifteenMinsAgo = new Date(new Date(event.timestamp) - 15 * 60 * 1000);
      const recentSameCamCount = await DetectionEvent.countDocuments({
        plateText: event.plateText,
        cameraId: event.cameraId,
        timestamp: { $gte: fifteenMinsAgo }
      });

      if (recentSameCamCount >= 3) {
        // Avoid duplicate active loitering alert within 15m
        const existingAlert = await Alert.findOne({
          plateText: event.plateText,
          cameraId: event.cameraId,
          type: 'LOITERING',
          timestamp: { $gte: fifteenMinsAgo }
        });

        if (!existingAlert) {
          const alert = await Alert.create({
            alertId: `ALT-LOIT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            type: 'LOITERING',
            severity: 'MEDIUM',
            plateText: event.plateText,
            cameraId: event.cameraId,
            location: event.location,
            timestamp: event.timestamp,
            reasonDetails: `Loitering detected: Plate ${event.plateText} sighted ${recentSameCamCount} times at ${camera ? camera.name : event.cameraId} within 15 minutes.`,
            relatedSightings: [{
              cameraId: event.cameraId,
              timestamp: event.timestamp,
              location: event.location,
              snapshot: event.imageSnapshotUrl
            }]
          });
          alertsCreated.push(alert);
        }
      }

      // Rule 4: LOW CONFIDENCE REPEATED SIGHTINGS FOR OPERATOR REVIEW
      if (event.confidence < 0.60) {
        const lowConfCount = await DetectionEvent.countDocuments({
          plateText: event.plateText,
          confidence: { $lt: 0.60 },
          timestamp: { $gte: fifteenMinsAgo }
        });

        if (lowConfCount >= 2) {
          const existingAlert = await Alert.findOne({
            plateText: event.plateText,
            type: 'LOW_CONFIDENCE_REPEATED',
            timestamp: { $gte: fifteenMinsAgo }
          });

          if (!existingAlert) {
            const alert = await Alert.create({
              alertId: `ALT-LC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              type: 'LOW_CONFIDENCE_REPEATED',
              severity: 'LOW',
              plateText: event.plateText,
              cameraId: event.cameraId,
              location: event.location,
              timestamp: event.timestamp,
              reasonDetails: `Low OCR Confidence (${(event.confidence * 100).toFixed(0)}%) repeated for plate ${event.plateText} at ${camera ? camera.name : event.cameraId}. Flagged for operator review.`,
              relatedSightings: [{
                cameraId: event.cameraId,
                timestamp: event.timestamp,
                location: event.location,
                snapshot: event.imageSnapshotUrl
              }]
            });
            alertsCreated.push(alert);
          }
        }
      }

    } catch (err) {
      console.error('[AnomalyService] Error evaluating event:', err);
    }

    return alertsCreated;
  }
}

module.exports = new AnomalyService();
