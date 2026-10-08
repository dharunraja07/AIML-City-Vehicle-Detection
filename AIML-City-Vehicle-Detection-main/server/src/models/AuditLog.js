const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },
  username: {
    type: String,
    required: true
  },
  action: {
    type: String, // e.g. PLATE_SEARCH, WATCHLIST_ADD, ALERT_ACKNOWLEDGE
    required: true,
    index: true
  },
  details: {
    type: Object,
    default: {}
  },
  ipAddress: {
    type: String,
    default: '127.0.0.1'
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, { timestamps: true });

module.exports = mongoose.model('AuditLog', auditLogSchema);
