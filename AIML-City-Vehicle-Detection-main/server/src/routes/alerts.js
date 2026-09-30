const express = require('express');
const router = express.Router();
const Alert = require('../models/Alert');

// GET /api/alerts - Fetch active alerts feed with filtering
router.get('/', async (req, res) => {
  try {
    const { status, severity, type, limit = 50, page = 1 } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (severity) filter.severity = severity;
    if (type) filter.type = type;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const alerts = await Alert.find(filter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Alert.countDocuments(filter);

    res.json({
      alerts,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch alerts', details: err.message });
  }
});

// GET /api/alerts/stats - Alert statistics
router.get('/stats', async (req, res) => {
  try {
    const [newAlerts, acknowledged, resolved, critical] = await Promise.all([
      Alert.countDocuments({ status: 'NEW' }),
      Alert.countDocuments({ status: 'ACKNOWLEDGED' }),
      Alert.countDocuments({ status: 'RESOLVED' }),
      Alert.countDocuments({ severity: 'CRITICAL', status: { $in: ['NEW', 'ACKNOWLEDGED'] } })
    ]);

    res.json({
      newAlerts,
      acknowledged,
      resolved,
      critical
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch alert stats', details: err.message });
  }
});

// PUT /api/alerts/:id/status - Update alert status (NEW -> ACKNOWLEDGED -> RESOLVED / FALSE_POSITIVE)
router.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, operatorNotes, assignedOperator } = req.body;

    const alert = await Alert.findOneAndUpdate(
      { alertId: id },
      {
        status,
        operatorNotes: operatorNotes || '',
        assignedOperator: assignedOperator || 'Operator 1'
      },
      { new: true }
    );

    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    if (req.io) {
      req.io.emit('alert:updated', alert);
    }

    res.json({ status: 'UPDATED', alert });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update alert status', details: err.message });
  }
};

router.put('/:id/status', router.updateStatus);

module.exports = router;
