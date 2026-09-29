const mongoose = require('mongoose');

const nodeSchema = new mongoose.Schema({
  nodeId: { type: String, required: true },
  name: { type: String, required: true },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true } // [lng, lat]
  }
}, { _id: false });

const edgeSchema = new mongoose.Schema({
  edgeId: { type: String, required: true },
  fromNode: { type: String, required: true },
  toNode: { type: String, required: true },
  lengthKm: { type: Number, required: true },
  speedLimitKmh: { type: Number, default: 50 },
  isOneWay: { type: Boolean, default: false },
  cameraIds: [{ type: String }]
}, { _id: false });

const roadGraphSchema = new mongoose.Schema({
  graphId: {
    type: String,
    required: true,
    default: 'COIMBATORE_MAIN',
    unique: true
  },
  nodes: [nodeSchema],
  edges: [edgeSchema],
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('RoadGraph', roadGraphSchema);
