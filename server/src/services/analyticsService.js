const DetectionEvent = require('../models/DetectionEvent');
const Camera = require('../models/Camera');

class AnalyticsService {
  /**
   * Computes traffic density per camera & per zone over rolling window.
   */
  async getTrafficDensity(windowMinutes = 15) {
    const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000);

    const cameraDensity = await DetectionEvent.aggregate([
      { $match: { timestamp: { $gte: cutoff } } },
      { $group: { _id: '$cameraId', vehicleCount: { $sum: 1 }, avgSpeed: { $avg: '$speedEstimate' } } },
      { $sort: { vehicleCount: -1 } }
    ]);

    const zoneDensity = await DetectionEvent.aggregate([
      { $match: { timestamp: { $gte: cutoff } } },
      {
        $lookup: {
          from: 'cameras',
          localField: 'cameraId',
          foreignField: 'cameraId',
          as: 'camera'
        }
      },
      { $unwind: { path: '$camera', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $ifNull: ['$camera.zone', 'Gandhipuram'] },
          vehicleCount: { $sum: 1 },
          avgSpeed: { $avg: '$speedEstimate' }
        }
      },
      { $sort: { vehicleCount: -1 } }
    ]);

    const formattedCamera = cameraDensity.map(c => ({
      cameraId: c._id,
      vehiclesPerMin: parseFloat((c.vehicleCount / windowMinutes).toFixed(1)),
      totalVehicles: c.vehicleCount,
      avgSpeedKmh: Math.round(c.avgSpeed || 45)
    }));

    const formattedZone = zoneDensity.map(z => ({
      zone: z._id,
      vehiclesPerMin: parseFloat((z.vehicleCount / windowMinutes).toFixed(1)),
      totalVehicles: z.vehicleCount,
      avgSpeedKmh: Math.round(z.avgSpeed || 45)
    }));

    return { windowMinutes, cameraDensity: formattedCamera, zoneDensity: formattedZone };
  }

  /**
   * Computes Origin-Destination (O-D) matrix between city zones.
   */
  async getOriginDestinationMatrix(timeGapMinutes = 30) {
    const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000); // Last 12 hours
    const events = await DetectionEvent.aggregate([
      { $match: { timestamp: { $gte: cutoff } } },
      {
        $lookup: {
          from: 'cameras',
          localField: 'cameraId',
          foreignField: 'cameraId',
          as: 'camera'
        }
      },
      { $unwind: { path: '$camera', preserveNullAndEmptyArrays: true } },
      { $sort: { plateText: 1, timestamp: 1 } },
      {
        $project: {
          plateText: 1,
          timestamp: 1,
          zone: { $ifNull: ['$camera.zone', 'Gandhipuram'] }
        }
      }
    ]);

    const trips = [];
    const userTrips = new Map(); // plateText -> list of events

    events.forEach(e => {
      if (!userTrips.has(e.plateText)) userTrips.set(e.plateText, []);
      userTrips.get(e.plateText).push(e);
    });

    const odCounts = new Map(); // "Origin|Destination" -> count

    userTrips.forEach((evts, plate) => {
      if (evts.length < 2) return;
      let tripStart = evts[0];
      let tripPrev = evts[0];

      for (let i = 1; i < evts.length; i++) {
        const curr = evts[i];
        const gapMins = (curr.timestamp - tripPrev.timestamp) / 60000;

        if (gapMins > timeGapMinutes || i === evts.length - 1) {
          const origin = tripStart.zone;
          const destination = curr.zone;

          if (origin !== destination) {
            const key = `${origin}|${destination}`;
            odCounts.set(key, (odCounts.get(key) || 0) + 1);
          }
          tripStart = curr;
        }
        tripPrev = curr;
      }
    });

    const matrix = [];
    odCounts.forEach((count, key) => {
      const [origin, destination] = key.split('|');
      matrix.push({ origin, destination, count });
    });

    matrix.sort((a, b) => b.count - a.count);

    return {
      topODPairs: matrix.slice(0, 10),
      matrix
    };
  }

  /**
   * Detects urban congestion bottlenecks and ranks by severity (Level of Service A to F).
   */
  async getCongestionBottlenecks() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const cameras = await Camera.find({});

    const cameraStats = await DetectionEvent.aggregate([
      { $match: { timestamp: { $gte: oneHourAgo } } },
      {
        $group: {
          _id: '$cameraId',
          count: { $sum: 1 },
          avgSpeed: { $avg: '$speedEstimate' }
        }
      }
    ]);

    const statsMap = new Map();
    cameraStats.forEach(s => statsMap.set(s._id, s));

    const bottlenecks = [];

    cameras.forEach(cam => {
      const stat = statsMap.get(cam.cameraId);
      const vehicleCount = stat ? stat.count : 0;
      const measuredSpeed = stat ? Math.round(stat.avgSpeed) : cam.speedLimitKmh;
      const speedLimit = cam.speedLimitKmh;

      const speedRatio = measuredSpeed / speedLimit;
      let los = 'LOS-A'; // Level of Service (A=Free flow, F=Gridlock)
      let severity = 'NORMAL';

      if (speedRatio < 0.35 && vehicleCount > 30) {
        los = 'LOS-F';
        severity = 'CRITICAL';
      } else if (speedRatio < 0.50 && vehicleCount > 20) {
        los = 'LOS-E';
        severity = 'HIGH';
      } else if (speedRatio < 0.65 && vehicleCount > 15) {
        los = 'LOS-D';
        severity = 'MEDIUM';
      } else if (speedRatio < 0.80) {
        los = 'LOS-C';
        severity = 'LOW';
      } else if (speedRatio < 0.90) {
        los = 'LOS-B';
      }

      if (severity !== 'NORMAL') {
        bottlenecks.push({
          cameraId: cam.cameraId,
          cameraName: cam.name,
          zone: cam.zone,
          location: cam.location,
          speedLimitKmh: speedLimit,
          measuredSpeedKmh: measuredSpeed,
          vehicleCount,
          levelOfService: los,
          severity
        });
      }
    });

    bottlenecks.sort((a, b) => a.measuredSpeedKmh - b.measuredSpeedKmh);

    return bottlenecks;
  }

  /**
   * Hourly trend analysis & vehicle type mix breakdown.
   */
  async getTrafficTrends() {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const hourlyFlow = await DetectionEvent.aggregate([
      { $match: { timestamp: { $gte: twentyFourHoursAgo } } },
      {
        $group: {
          _id: { $hour: '$timestamp' },
          count: { $sum: 1 },
          avgSpeed: { $avg: '$speedEstimate' }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    const vehicleMix = await DetectionEvent.aggregate([
      { $match: { timestamp: { $gte: twentyFourHoursAgo } } },
      {
        $group: {
          _id: '$vehicleType',
          count: { $sum: 1 }
        }
      }
    ]);

    const formattedHourly = hourlyFlow.map(h => ({
      hour: `${h._id}:00`,
      count: h.count,
      avgSpeed: Math.round(h.avgSpeed || 45)
    }));

    return {
      hourlyFlow: formattedHourly,
      vehicleMix: vehicleMix.map(v => ({ type: v._id, count: v.count }))
    };
  }
}

module.exports = new AnalyticsService();
