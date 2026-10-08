const express = require('express');
const router = express.Router();
const trajectoryService = require('../services/trajectoryService');
const DetectionEvent = require('../models/DetectionEvent');

// GET /api/trajectory/:plate - Single plate trajectory search
router.get('/:plate', async (req, res) => {
  try {
    const { plate } = req.params;
    const { from, to } = req.query;

    const result = await trajectoryService.getTrajectory(plate, from, to);
    res.json(result);
  } catch (err) {
    console.error('Error fetching trajectory:', err);
    res.status(500).json({ error: 'Failed to fetch trajectory', details: err.message });
  }
});

// GET /api/trajectory/co-occurrence - Co-occurrence query
router.get('/co-occurrence/search', async (req, res) => {
  try {
    const { camA, camB, windowMins } = req.query;
    if (!camA || !camB) {
      return res.status(400).json({ error: 'Query parameters camA and camB are required' });
    }

    const matches = await trajectoryService.getCoOccurrence(
      camA,
      camB,
      parseInt(windowMins) || 30
    );

    res.json({
      camA,
      camB,
      windowMinutes: parseInt(windowMins) || 30,
      matchCount: matches.length,
      matches
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to process co-occurrence query', details: err.message });
  }
});

// GET /api/trajectory/last-seen/:plate - Last seen quick lookup
router.get('/last-seen/:plate', async (req, res) => {
  try {
    const cleanPlate = req.params.plate.toUpperCase().trim();
    const lastEvent = await DetectionEvent.findOne({ plateText: cleanPlate }).sort({ timestamp: -1 });

    if (!lastEvent) {
      return res.status(404).json({ error: 'Vehicle not found in detection system' });
    }

    res.json({
      plateText: cleanPlate,
      lastSeenAt: lastEvent.timestamp,
      cameraId: lastEvent.cameraId,
      location: lastEvent.location,
      direction: lastEvent.direction,
      confidence: lastEvent.confidence,
      vehicleType: lastEvent.vehicleType,
      snapshotUrl: lastEvent.imageSnapshotUrl
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch last seen info', details: err.message });
  }
});

module.exports = router;
