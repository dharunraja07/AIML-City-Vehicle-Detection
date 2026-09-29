const express = require('express');
const router = express.Router();
const Watchlist = require('../models/Watchlist');
const watchlistService = require('../services/watchlistService');

// GET /api/watchlist - List active watchlist entries
router.get('/', async (req, res) => {
  try {
    const items = await Watchlist.find({ isActive: true }).sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch watchlist', details: err.message });
  }
});

// POST /api/watchlist - Add new blacklisted plate
router.post('/', async (req, res) => {
  try {
    const { plateText, reason, priority, notes, addedBy } = req.body;
    if (!plateText) {
      return res.status(400).json({ error: 'plateText is required' });
    }

    const cleanPlate = plateText.toUpperCase().trim();
    const item = await Watchlist.create({
      plateText: cleanPlate,
      reason: reason || 'STOLEN',
      priority: priority || 'HIGH',
      notes: notes || '',
      addedBy: addedBy || 'Admin Operator',
      isActive: true
    });

    await watchlistService.loadCache(); // Force refresh in-memory cache

    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create watchlist entry', details: err.message });
  }
});

// DELETE /api/watchlist/:id - Remove / deactivate plate from watchlist
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await Watchlist.findByIdAndUpdate(id, { isActive: false });
    await watchlistService.loadCache();
    res.json({ status: 'DEACTIVATED', id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to deactivate watchlist entry', details: err.message });
  }
});

module.exports = router;
