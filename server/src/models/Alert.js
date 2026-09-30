const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  alertId: {
    type: String,
    required: true,
    unique: true
  },
  type: {
    type: String,
    enum: [
      'WATCHLIST_MATCH',
      'IMPOSSIBLE_SPEED',
      'WRONG_WAY',
      'ROUTE_DEVIATION',
      'RESTRICTED_ZONE',
      'LOITERING',
      'LOW_CONFIDENCE_REPEATED'
    ],
    required: true,
    index: true
  },
  severity: {
    type: String,
    enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
    default: 'HIGH'
  },
  plateText: {
    type: String,
    required: true,
    uppercase: true,
    index: true
  },
  cameraId: {
    type: String,
    required: true,
    index: true
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [lng, lat]
      required: true
    }
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  reasonDetails: {
    type: String,
    required: true
  },
  relatedSightings: [{
    cameraId: String,
    timestamp: Date,
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: [Number]
    },
    snapshot: String
  }],
  status: {
    type: String,
    enum: ['NEW', 'ACKNOWLEDGED', 'RESOLVED', 'FALSE_POSITIVE'],
    default: 'NEW',
    index: true
  },
  assignedOperator: {
    type: String,
    default: ''
  },
  operatorNotes: {
    type: String,
    default: ''
  }
}, { timestamps: true });

alertSchema.index({ status: 1, timestamp: -1 });

module.exports = mongoose.model('Alert', alertSchema);
