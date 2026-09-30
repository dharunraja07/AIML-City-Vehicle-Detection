const mongoose = require('mongoose');

const watchlistSchema = new mongoose.Schema({
  plateText: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    index: true
  },
  reason: {
    type: String,
    enum: ['STOLEN', 'WANTED', 'EXPIRED_INSURANCE', 'SUSPICIOUS', 'CUSTOM'],
    default: 'STOLEN'
  },
  priority: {
    type: String,
    enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
    default: 'HIGH'
  },
  notes: {
    type: String,
    default: ''
  },
  addedBy: {
    type: String,
    default: 'System Admin'
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, { timestamps: true });

module.exports = mongoose.model('Watchlist', watchlistSchema);
