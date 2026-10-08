const DetectionEvent = require('../models/DetectionEvent');
const Camera = require('../models/Camera');
const RoadGraph = require('../models/RoadGraph');
const { ocrLevenshteinDistance } = require('../utils/indianPlateValidator');

/**
 * Calculates geodesic distance between two points in km (Haversine formula).
 */
function haversineDistanceKm(coords1, coords2) {
  const [lon1, lat1] = coords1;
  const [lon2, lat2] = coords2;
  const R = 6371;
  const dLat = (lat1 - lat2) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat2 * Math.PI / 180) * Math.cos(lat1 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

class TrajectoryService {
  /**
   * Builds Dijkstra shortest path between two camera locations on the road graph.
   */
  async inferRoutePath(startCamera, endCamera) {
    try {
      const roadGraphDoc = await RoadGraph.findOne({ graphId: 'COIMBATORE_MAIN' });
      if (!roadGraphDoc || !roadGraphDoc.nodes || !roadGraphDoc.edges) {
        return [startCamera.location.coordinates, endCamera.location.coordinates];
      }

      const nodes = roadGraphDoc.nodes;
      const edges = roadGraphDoc.edges;

      // Find closest graph node to startCamera and endCamera
      let startNodeId = nodes[0].nodeId;
      let minStartDist = Infinity;
      let endNodeId = nodes[0].nodeId;
      let minEndDist = Infinity;

      nodes.forEach(n => {
        const dStart = haversineDistanceKm(startCamera.location.coordinates, n.location.coordinates);
        if (dStart < minStartDist) {
          minStartDist = dStart;
          startNodeId = n.nodeId;
        }

        const dEnd = haversineDistanceKm(endCamera.location.coordinates, n.location.coordinates);
        if (dEnd < minEndDist) {
          minEndDist = dEnd;
          endNodeId = n.nodeId;
        }
      });

      if (startNodeId === endNodeId) {
        return [startCamera.location.coordinates, endCamera.location.coordinates];
      }

      // Adjacency graph
      const adj = new Map();
      nodes.forEach(n => adj.set(n.nodeId, []));
      edges.forEach(e => {
        adj.get(e.fromNode).push({ to: e.toNode, weight: e.lengthKm });
        if (!e.isOneWay) {
          adj.get(e.toNode).push({ to: e.fromNode, weight: e.lengthKm });
        }
      });

      // Dijkstra
      const distances = new Map();
      const previous = new Map();
      const unvisited = new Set(nodes.map(n => n.nodeId));

      nodes.forEach(n => distances.set(n.nodeId, Infinity));
      distances.set(startNodeId, 0);

      while (unvisited.size > 0) {
        let current = null;
        let smallestDist = Infinity;
        for (const nodeId of unvisited) {
          if (distances.get(nodeId) < smallestDist) {
            smallestDist = distances.get(nodeId);
            current = nodeId;
          }
        }

        if (!current || smallestDist === Infinity) break;
        if (current === endNodeId) break;

        unvisited.delete(current);

        const neighbors = adj.get(current) || [];
        for (const neighbor of neighbors) {
          if (unvisited.has(neighbor.to)) {
            const alt = distances.get(current) + neighbor.weight;
            if (alt < distances.get(neighbor.to)) {
              distances.set(neighbor.to, alt);
              previous.set(neighbor.to, current);
            }
          }
        }
      }

      // Reconstruct path
      const pathNodes = [];
      let curr = endNodeId;
      while (curr) {
        pathNodes.unshift(curr);
        curr = previous.get(curr);
      }

      const nodeMap = new Map();
      nodes.forEach(n => nodeMap.set(n.nodeId, n.location.coordinates));

      const polyline = [startCamera.location.coordinates];
      pathNodes.forEach(nId => {
        if (nodeMap.has(nId)) polyline.push(nodeMap.get(nId));
      });
      polyline.push(endCamera.location.coordinates);

      return polyline;
    } catch (err) {
      console.error('[TrajectoryService] Route inference error:', err);
      return [startCamera.location.coordinates, endCamera.location.coordinates];
    }
  }

  async getTrajectory(plateQuery, fromDate, toDate) {
    const cleanQuery = plateQuery.toUpperCase().trim();
    const queryFilter = {};

    if (fromDate || toDate) {
      queryFilter.timestamp = {};
      if (fromDate) queryFilter.timestamp.$gte = new Date(fromDate);
      if (toDate) queryFilter.timestamp.$lte = new Date(toDate);
    }

    // 1. Exact Match
    let sightings = await DetectionEvent.find({
      plateText: cleanQuery,
      ...queryFilter
    }).sort({ timestamp: 1 });

    let fuzzyMatches = [];

    // 2. Fuzzy Search Fallback if exact match yields few results
    if (sightings.length === 0) {
      const distinctPlates = await DetectionEvent.distinct('plateText', {
        timestamp: queryFilter.timestamp || { $exists: true }
      });

      for (const plate of distinctPlates) {
        const dist = ocrLevenshteinDistance(cleanQuery, plate);
        if (dist <= 1.5) {
          const count = await DetectionEvent.countDocuments({ plateText: plate });
          const similarity = 1 - (dist / Math.max(cleanQuery.length, plate.length));
          fuzzyMatches.push({
            plateText: plate,
            similarity: parseFloat(similarity.toFixed(2)),
            sightingCount: count
          });
        }
      }

      fuzzyMatches.sort((a, b) => b.similarity - a.similarity);
    }

    if (sightings.length === 0) {
      return {
        matchedPlate: cleanQuery,
        isFuzzy: true,
        fuzzyMatches,
        sightings: [],
        derivedSegments: [],
        inferredRoutePolyline: []
      };
    }

    // Enrich camera details
    const cameraMap = new Map();
    const cameras = await Camera.find({});
    cameras.forEach(c => cameraMap.set(c.cameraId, c));

    const enrichedSightings = sightings.map(s => {
      const cam = cameraMap.get(s.cameraId);
      return {
        eventId: s.eventId,
        cameraId: s.cameraId,
        cameraName: cam ? cam.name : s.cameraId,
        zone: cam ? cam.zone : 'City Wide',
        location: s.location,
        timestamp: s.timestamp,
        direction: s.direction,
        confidence: s.confidence,
        vehicleType: s.vehicleType,
        snapshotUrl: s.imageSnapshotUrl,
        speedEstimate: s.speedEstimate
      };
    });

    // 3. Derived Segments & Route Polyline
    const derivedSegments = [];
    const fullRoutePolyline = [];

    for (let i = 0; i < enrichedSightings.length - 1; i++) {
      const curr = enrichedSightings[i];
      const next = enrichedSightings[i + 1];

      const distanceKm = haversineDistanceKm(
        curr.location.coordinates,
        next.location.coordinates
      );

      const durationSec = Math.max(1, (new Date(next.timestamp) - new Date(curr.timestamp)) / 1000);
      const avgSpeedKmh = (distanceKm / durationSec) * 3600;

      derivedSegments.push({
        fromCamera: curr.cameraName,
        fromCameraId: curr.cameraId,
        toCamera: next.cameraName,
        toCameraId: next.cameraId,
        distanceKm: parseFloat(distanceKm.toFixed(2)),
        durationSec: Math.round(durationSec),
        avgSpeedKmh: parseFloat(avgSpeedKmh.toFixed(1)),
        isAnomaly: avgSpeedKmh > 140
      });

      // Compute Dijkstra path between consecutive camera nodes
      const camA = cameraMap.get(curr.cameraId) || { location: curr.location };
      const camB = cameraMap.get(next.cameraId) || { location: next.location };
      const segmentPolyline = await this.inferRoutePath(camA, camB);

      fullRoutePolyline.push(...segmentPolyline);
    }

    return {
      matchedPlate: cleanQuery,
      isFuzzy: false,
      fuzzyMatches: [],
      sightings: enrichedSightings,
      derivedSegments,
      inferredRoutePolyline: fullRoutePolyline
    };
  }

  async getCoOccurrence(camAId, camBId, windowMins = 30) {
    const windowMs = windowMins * 60 * 1000;
    const eventsA = await DetectionEvent.find({ cameraId: camAId }).sort({ timestamp: -1 }).limit(200);

    const matches = [];
    for (const evtA of eventsA) {
      const startTime = new Date(evtA.timestamp.getTime() - windowMs);
      const endTime = new Date(evtA.timestamp.getTime() + windowMs);

      const evtB = await DetectionEvent.findOne({
        cameraId: camBId,
        plateText: evtA.plateText,
        timestamp: { $gte: startTime, $lte: endTime }
      });

      if (evtB) {
        const timeGapSec = Math.abs((evtB.timestamp - evtA.timestamp) / 1000);
        matches.push({
          plateText: evtA.plateText,
          timeCamA: evtA.timestamp,
          timeCamB: evtB.timestamp,
          timeGapMinutes: parseFloat((timeGapSec / 60).toFixed(1)),
          vehicleType: evtA.vehicleType
        });
      }
    }

    return matches;
  }
}

module.exports = new TrajectoryService();
