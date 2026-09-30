const express = require('express');
const router = express.Router();
const ingestionService = require('../services/ingestionService');
const DetectionEvent = require('../models/DetectionEvent');
const Camera = require('../models/Camera');
const Alert = require('../models/Alert');

// POST /api/events - Ingest a single detection event
router.post('/', async (req, res) => {
  try {
    const result = await ingestionService.processEvent(req.body, req.io);
    res.status(201).json(result);
  } catch (err) {
    console.error('Error ingesting event:', err);
    res.status(500).json({ error: 'Failed to process event', details: err.message });
  }
});

// POST /api/events/batch - Ingest array of detection events
router.post('/batch', async (req, res) => {
  try {
    const events = Array.isArray(req.body) ? req.body : req.body.events;
    if (!Array.isArray(events)) {
      return res.status(400).json({ error: 'Body must be an array of events or { events: [...] }' });
    }
    const results = await ingestionService.processBatch(events, req.io);
    res.status(201).json({ processedCount: results.length, results });
  } catch (err) {
    console.error('Error batch ingesting events:', err);
    res.status(500).json({ error: 'Failed to process batch events', details: err.message });
  }
});

// GET /api/events/recent - Fetch recent detection events with pagination
router.get('/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;

    const events = await DetectionEvent.find({})
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);

    const total = await DetectionEvent.countDocuments({});

    // Enrich with camera details
    const cameraMap = new Map();
    const cameras = await Camera.find({});
    cameras.forEach(c => cameraMap.set(c.cameraId, c));

    const enrichedEvents = events.map(evt => {
      const cam = cameraMap.get(evt.cameraId);
      return {
        ...evt.toObject(),
        cameraName: cam ? cam.name : evt.cameraId,
        zone: cam ? cam.zone : 'City Wide'
      };
    });

    res.json({
      events: enrichedEvents,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch recent events', details: err.message });
  }
});

// GET /api/events/stats - Fetch overall dashboard KPIs
router.get('/stats', async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [totalVehiclesToday, activeCameras, totalCameras, openAlerts] = await Promise.all([
      DetectionEvent.countDocuments({ timestamp: { $gte: todayStart } }),
      Camera.countDocuments({ status: 'ACTIVE' }),
      Camera.countDocuments({}),
      Alert.countDocuments({ status: { $in: ['NEW', 'ACKNOWLEDGED'] } })
    ]);

    // Average city speed estimate over last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const speedAgg = await DetectionEvent.aggregate([
      { $match: { timestamp: { $gte: oneHourAgo }, speedEstimate: { $gt: 0 } } },
      { $group: { _id: null, avgSpeed: { $avg: '$speedEstimate' } } }
    ]);

    const avgCitySpeed = speedAgg.length > 0 ? Math.round(speedAgg[0].avgSpeed) : 48;

    res.json({
      vehiclesToday: totalVehiclesToday,
      activeCameras,
      totalCameras,
      openAlerts,
      avgCitySpeedKmh: avgCitySpeed,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch dashboard stats', details: err.message });
  }
});

module.exports = router;
