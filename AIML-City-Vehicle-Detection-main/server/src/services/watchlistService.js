const Watchlist = require('../models/Watchlist');
const { ocrLevenshteinDistance } = require('../utils/indianPlateValidator');

class WatchlistService {
  constructor() {
    this.cache = new Map(); // plateText -> Watchlist document
    this.lastRefreshed = 0;
    this.REFRESH_INTERVAL_MS = 30000; // Refresh cache every 30 seconds
  }

  async loadCache() {
    try {
      const activeItems = await Watchlist.find({ isActive: true });
      this.cache.clear();
      activeItems.forEach(item => {
        this.cache.set(item.plateText.toUpperCase(), item);
      });
      this.lastRefreshed = Date.now();
    } catch (err) {
      console.error('[WatchlistService] Error loading cache:', err);
    }
  }

  async checkPlate(plateText) {
    if (Date.now() - this.lastRefreshed > this.REFRESH_INTERVAL_MS) {
      await this.loadCache();
    }

    const cleanPlate = plateText.toUpperCase();

    // 1. Exact Match
    if (this.cache.has(cleanPlate)) {
      return {
        matched: true,
        matchType: 'EXACT',
        watchlistEntry: this.cache.get(cleanPlate),
        confidence: 1.0
      };
    }

    // 2. Fuzzy Match (OCR Levenshtein Distance <= 1.0)
    for (const [wPlate, entry] of this.cache.entries()) {
      const dist = ocrLevenshteinDistance(cleanPlate, wPlate);
      if (dist <= 1.0) {
        const similarity = 1 - (dist / Math.max(cleanPlate.length, wPlate.length));
        return {
          matched: true,
          matchType: 'FUZZY',
          matchedPlate: wPlate,
          watchlistEntry: entry,
          confidence: parseFloat(similarity.toFixed(2))
        };
      }
    }

    return { matched: false };
  }
}

module.exports = new WatchlistService();
