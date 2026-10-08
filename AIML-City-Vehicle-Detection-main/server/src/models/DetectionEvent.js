const mongoose = require('mongoose');

const detectionEventSchema = new mongoose.Schema({
  eventId: {
    type: String,
    required: true,
    unique: true
  },
  plateText: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    index: true
  },
  rawPlateText: {
    type: String,
    required: true,
    uppercase: true
  },
  confidence: {
    type: Number,
    required: true,
    min: 0,
    max: 1
  },
  charConfidences: [{
    type: Number
  }],
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
  direction: {
    type: String,
    default: 'NB'
  },
  laneId: {
    type: Number,
    default: 1
  },
  vehicleType: {
    type: String,
    enum: ['CAR', 'BIKE', 'TRUCK', 'BUS', 'AUTO', 'UNKNOWN'],
    default: 'CAR'
  },
  speedEstimate: {
    type: Number, // km/h
    default: 0
  },
  imageSnapshotUrl: {
    type: String,
    default: ''
  },
  isValidPlate: {
    type: Boolean,
    default: true
  },
  isWatchlistMatch: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

// Compound indexes for trajectory and spatial queries
detectionEventSchema.index({ plateText: 1, timestamp: -1 });
detectionEventSchema.index({ cameraId: 1, timestamp: -1 });
detectionEventSchema.index({ timestamp: -1 });
detectionEventSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('DetectionEvent', detectionEventSchema);
