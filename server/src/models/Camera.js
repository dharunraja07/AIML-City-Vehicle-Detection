const mongoose = require('mongoose');

const cameraSchema = new mongoose.Schema({
  cameraId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  name: {
    type: String,
    required: true
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    }
  },
  heading: {
    type: Number, // 0 to 360 degrees
    default: 0
  },
  direction: {
    type: String,
    enum: ['NB', 'SB', 'EB', 'WB', 'IN', 'OUT', 'NE', 'NW', 'SE', 'SW'],
    default: 'NB'
  },
  laneCount: {
    type: Number,
    default: 2
  },
  zone: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'OFFLINE', 'MAINTENANCE'],
    default: 'ACTIVE'
  },
  speedLimitKmh: {
    type: Number,
    default: 50
  },
  lastPingAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

cameraSchema.index({ location: '2dsphere' });
cameraSchema.index({ zone: 1 });
cameraSchema.index({ status: 1 });

module.exports = mongoose.model('Camera', cameraSchema);
