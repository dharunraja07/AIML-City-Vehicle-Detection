const express = require('express');
const router = express.Router();
const Camera = require('../models/Camera');

// GET /api/cameras - List all camera nodes
router.get('/', async (req, res) => {
  try {
    const cameras = await Camera.find({}).sort({ cameraId: 1 });
    res.json(cameras);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch cameras', details: err.message });
  }
});

module.exports = router;
