const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const analyticsService = require('../services/analyticsService');

const EVAL_RESULTS_FILE = path.join(__dirname, '../../../ml-service/eval_results.json');
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000';

// GET /api/analytics/density
router.get('/density', async (req, res) => {
  try {
    const windowMinutes = parseInt(req.query.window) || 15;
    const result = await analyticsService.getTrafficDensity(windowMinutes);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch density analytics', details: err.message });
  }
});

// GET /api/analytics/od-matrix
router.get('/od-matrix', async (req, res) => {
  try {
    const result = await analyticsService.getOriginDestinationMatrix();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch O-D matrix analytics', details: err.message });
  }
});

// GET /api/analytics/bottlenecks
router.get('/bottlenecks', async (req, res) => {
  try {
    const bottlenecks = await analyticsService.getCongestionBottlenecks();
    res.json({ count: bottlenecks.length, bottlenecks });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch congestion bottlenecks', details: err.message });
  }
});

// GET /api/analytics/trends
router.get('/trends', async (req, res) => {
  try {
    const trends = await analyticsService.getTrafficTrends();
    res.json(trends);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch trend analytics', details: err.message });
  }
});

// GET /api/analytics/eval-results
router.get('/eval-results', async (req, res) => {
  try {
    if (fs.existsSync(EVAL_RESULTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(EVAL_RESULTS_FILE, 'utf8'));
      return res.json(data);
    }
    // Forward to ML service if file not found locally
    const mlRes = await axios.get(`${ML_SERVICE_URL}/anpr/eval-results`);
    return res.json(mlRes.data);
  } catch (err) {
    return res.status(404).json({ error: 'No evaluation run yet', details: err.message });
  }
});

// POST /api/analytics/evaluate
router.get('/trigger-eval', async (req, res) => {
  try {
    const mlRes = await axios.post(`${ML_SERVICE_URL}/anpr/evaluate`);
    return res.json(mlRes.data);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to trigger evaluation', details: err.message });
  }
});

module.exports = router;
