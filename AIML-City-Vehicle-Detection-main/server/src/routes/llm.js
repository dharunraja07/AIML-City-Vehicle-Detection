const express = require('express');
const router = express.Router();
const trajectoryService = require('../services/trajectoryService');
const DetectionEvent = require('../models/DetectionEvent');

/**
 * Natural language rule parser for trajectory queries.
 */
function parseNaturalLanguageQuery(prompt) {
  const cleanPrompt = prompt.toUpperCase();

  // Extract Indian plate pattern e.g. TN34AB1234 or 22BH9876AA
  const plateMatch = cleanPrompt.match(/([A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}|[0-9]{2}BH[0-9]{4}[A-Z]{1,2})/);
  const plateText = plateMatch ? plateMatch[1] : null;

  // Extract time keywords
  let fromDate = null;
  let toDate = null;
  const now = new Date();

  if (cleanPrompt.includes('YESTERDAY')) {
    fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    fromDate.setHours(0, 0, 0, 0);
    toDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    toDate.setHours(23, 59, 59, 999);
  } else if (cleanPrompt.includes('TODAY')) {
    fromDate = new Date();
    fromDate.setHours(0, 0, 0, 0);
    toDate = new Date();
  } else if (cleanPrompt.includes('LAST 2 HOURS') || cleanPrompt.includes('2 HOURS')) {
    fromDate = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  } else if (cleanPrompt.includes('LAST 12 HOURS')) {
    fromDate = new Date(now.getTime() - 12 * 60 * 60 * 1000);
  }

  // Extract zone names
  const zones = ['GANDHIPURAM', 'RS PURAM', 'PEELAMEDU', 'AVINASHI ROAD', 'UKKADAM', 'SINGANALLUR', 'SARAVANAMPATTI'];
  let zone = null;
  for (const z of zones) {
    if (cleanPrompt.includes(z)) {
      zone = z;
      break;
    }
  }

  return {
    plateText,
    fromDate: fromDate ? fromDate.toISOString() : null,
    toDate: toDate ? toDate.toISOString() : null,
    zone,
    originalPrompt: prompt
  };
}

// POST /api/llm/query - Translate NL prompt into structured trajectory API filters
router.post('/query', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const structuredFilters = parseNaturalLanguageQuery(prompt);

    if (structuredFilters.plateText) {
      const trajectory = await trajectoryService.getTrajectory(
        structuredFilters.plateText,
        structuredFilters.fromDate,
        structuredFilters.toDate
      );

      return res.json({
        prompt,
        structuredFilters,
        resultType: 'SINGLE_PLATE_TRAJECTORY',
        trajectory
      });
    }

    // General event query by zone or time
    const queryFilter = {};
    if (structuredFilters.fromDate) queryFilter.timestamp = { $gte: new Date(structuredFilters.fromDate) };

    const events = await DetectionEvent.find(queryFilter).sort({ timestamp: -1 }).limit(50);

    res.json({
      prompt,
      structuredFilters,
      resultType: 'EVENT_STREAM',
      eventsCount: events.length,
      events
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to process natural language query', details: err.message });
  }
});

module.exports = router;
