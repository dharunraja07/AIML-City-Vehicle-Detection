const fs = require('fs');
const path = require('path');
const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:5000/api/events/batch';
const CAMERAS_PATH = path.join(__dirname, '../data/cameras.json');
const ROAD_GRAPH_PATH = path.join(__dirname, '../data/road_graph.json');

// Indian State Codes
const STATES = ['TN', 'TN', 'TN', 'TN', 'KA', 'KL', 'AP', 'MH', 'DL']; // Weighted towards TN

// Helper to generate a random valid Indian License Plate
function generateRandomPlate() {
  const isBH = Math.random() < 0.05;
  if (isBH) {
    const year = Math.floor(Math.random() * 5 + 20);
    const num = String(Math.floor(Math.random() * 9000 + 1000));
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const series = chars[Math.floor(Math.random() * chars.length)] + chars[Math.floor(Math.random() * chars.length)];
    return `${year}BH${num}${series}`;
  }

  const state = STATES[Math.floor(Math.random() * STATES.length)];
  const district = String(Math.floor(Math.random() * 90 + 10)); // e.g. 37, 38, 66
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const seriesLen = Math.floor(Math.random() * 2) + 1; // 1 or 2 chars
  let series = '';
  for (let i = 0; i < seriesLen; i++) {
    series += chars[Math.floor(Math.random() * chars.length)];
  }
  const number = String(Math.floor(Math.random() * 9000 + 1000));
  return `${state}${district}${series}${number}`;
}

// Inject OCR confusion noise (O/0, I/1, B/8, S/5)
function injectOcrNoise(plateText, noiseRate = 0.05) {
  if (Math.random() > noiseRate) return plateText;

  const swaps = {
    '0': 'O', 'O': '0',
    '1': 'I', 'I': '1',
    '8': 'B', 'B': '8',
    '5': 'S', 'S': '5'
  };

  const chars = plateText.split('');
  const idx = Math.floor(Math.random() * chars.length);
  if (swaps[chars[idx]]) {
    chars[idx] = swaps[chars[idx]];
  }
  return chars.join('');
}

class TrafficSimulator {
  constructor() {
    this.cameras = [];
    this.cameraMap = new Map();
    this.nodes = [];
    this.edges = [];
    this.graph = new Map(); // nodeId -> [{ toNode, edge, lengthKm, speedLimitKmh }]
    this.vehicles = []; // Active simulated vehicles
    this.isRunning = false;
    this.tickIntervalMs = 1000;
  }

  init() {
    console.log('[Simulator] Loading camera & road graph data...');
    if (!fs.existsSync(CAMERAS_PATH) || !fs.existsSync(ROAD_GRAPH_PATH)) {
      console.error('[Simulator] Error: Data files missing!');
      process.exit(1);
    }

    this.cameras = JSON.parse(fs.readFileSync(CAMERAS_PATH, 'utf8'));
    this.cameras.forEach(c => this.cameraMap.set(c.cameraId, c));

    const roadGraph = JSON.parse(fs.readFileSync(ROAD_GRAPH_PATH, 'utf8'));
    this.nodes = roadGraph.nodes;
    this.edges = roadGraph.edges;

    // Build graph adjacency list
    this.edges.forEach(edge => {
      if (!this.graph.has(edge.fromNode)) this.graph.set(edge.fromNode, []);
      if (!this.graph.has(edge.toNode)) this.graph.set(edge.toNode, []);

      this.graph.get(edge.fromNode).push({
        toNode: edge.toNode,
        edge
      });

      if (!edge.isOneWay) {
        this.graph.get(edge.toNode).push({
          toNode: edge.fromNode,
          edge
        });
      }
    });

    console.log(`[Simulator] Graph loaded: ${this.nodes.length} nodes, ${this.edges.length} edges, ${this.cameras.length} cameras.`);

    // Initialize 200 random vehicles
    for (let i = 0; i < 200; i++) {
      this.spawnRandomVehicle();
    }

    // Initialize Scenario Vehicles
    this.initScenarioVehicles();
  }

  initScenarioVehicles() {
    // 1. Blacklisted stolen vehicle
    this.vehicles.push({
      plateText: 'TN37AB1234',
      vehicleType: 'CAR',
      currentNodeIndex: 0,
      path: ['N1', 'N2', 'N3', 'N4', 'N5', 'N7', 'N8'],
      speedKmh: 55,
      isScenario: true,
      label: 'STOLEN_VEHICLE'
    });

    // 2. Cloned Plate Vehicle (will trigger impossible speed alert when another instance fires)
    this.vehicles.push({
      plateText: 'TN38XY9999',
      vehicleType: 'CAR',
      currentNodeIndex: 0,
      path: ['N1', 'N2', 'N3'],
      speedKmh: 60,
      isScenario: true,
      label: 'CLONED_PLATE_1'
    });

    // 3. Loitering Vehicle circulating around Town Hall
    this.vehicles.push({
      plateText: 'TN33CC4040',
      vehicleType: 'CAR',
      currentNodeIndex: 0,
      path: ['N15', 'N16', 'N15', 'N16', 'N15', 'N16'],
      speedKmh: 35,
      isScenario: true,
      label: 'LOITERING_VEHICLE'
    });
  }

  spawnRandomVehicle() {
    const randomStart = this.nodes[Math.floor(Math.random() * this.nodes.length)].nodeId;
    const randomEnd = this.nodes[Math.floor(Math.random() * this.nodes.length)].nodeId;

    const vehicleTypes = ['CAR', 'CAR', 'CAR', 'BIKE', 'BIKE', 'TRUCK', 'BUS', 'AUTO'];
    const vehicleType = vehicleTypes[Math.floor(Math.random() * vehicleTypes.length)];

    this.vehicles.push({
      plateText: generateRandomPlate(),
      vehicleType,
      currentNodeIndex: 0,
      path: [randomStart, randomEnd], // Simple hop
      speedKmh: Math.floor(Math.random() * 25 + 40),
      isScenario: false
    });
  }

  async tick() {
    const eventsBatch = [];

    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      if (v.currentNodeIndex >= v.path.length - 1) {
        // Reset or re-route vehicle
        if (v.isScenario) {
          v.currentNodeIndex = 0; // Loop scenario trips
        } else {
          const randomEnd = this.nodes[Math.floor(Math.random() * this.nodes.length)].nodeId;
          v.path = [v.path[v.path.length - 1], randomEnd];
          v.currentNodeIndex = 0;
        }
      }

      const fromNodeId = v.path[v.currentNodeIndex];
      const toNodeId = v.path[v.currentNodeIndex + 1];

      // Find matching edge
      const edgeCandidates = this.edges.filter(
        e => (e.fromNode === fromNodeId && e.toNode === toNodeId) ||
          (!e.isOneWay && e.fromNode === toNodeId && e.toNode === fromNodeId)
      );

      if (edgeCandidates.length > 0) {
        const edge = edgeCandidates[0];
        if (edge.cameraIds && edge.cameraIds.length > 0) {
          // Pick a camera on this edge
          const cameraId = edge.cameraIds[Math.floor(Math.random() * edge.cameraIds.length)];
          const camera = this.cameraMap.get(cameraId);

          if (camera) {
            const rawPlateText = injectOcrNoise(v.plateText, 0.05);

            eventsBatch.push({
              eventId: `EVT-SIM-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
              plateText: v.plateText,
              rawPlateText,
              confidence: parseFloat((Math.random() * 0.15 + 0.85).toFixed(2)),
              cameraId: camera.cameraId,
              location: camera.location,
              timestamp: new Date().toISOString(),
              direction: camera.direction,
              laneId: Math.floor(Math.random() * camera.laneCount) + 1,
              vehicleType: v.vehicleType,
              speedEstimate: v.speedKmh + Math.floor(Math.random() * 6 - 3)
            });
          }
        }
      }

      v.currentNodeIndex++;
    }

    // Occasional Scenario Injection: Cloned Plate jump to distant camera!
    if (Math.random() < 0.15) {
      const cameraSulur = this.cameraMap.get('CAM-CBE-025'); // Sulur Toll Gate East (20km away)
      if (cameraSulur) {
        eventsBatch.push({
          eventId: `EVT-SIM-CLONE-${Date.now()}`,
          plateText: 'TN38XY9999',
          rawPlateText: 'TN38XY9999',
          confidence: 0.98,
          cameraId: cameraSulur.cameraId,
          location: cameraSulur.location,
          timestamp: new Date().toISOString(),
          direction: cameraSulur.direction,
          laneId: 1,
          vehicleType: 'CAR',
          speedEstimate: 75
        });
      }
    }

    // Occasional Scenario Injection: Wrong-Way vehicle on One-Way segment
    if (Math.random() < 0.08) {
      const cameraFlyover = this.cameraMap.get('CAM-CBE-002'); // Southbound only
      if (cameraFlyover) {
        eventsBatch.push({
          eventId: `EVT-SIM-WW-${Date.now()}`,
          plateText: 'TN66BZ5500',
          rawPlateText: 'TN66BZ5500',
          confidence: 0.94,
          cameraId: cameraFlyover.cameraId,
          location: cameraFlyover.location,
          timestamp: new Date().toISOString(),
          direction: 'NB', // Opposing Southbound direction!
          laneId: 1,
          vehicleType: 'TRUCK',
          speedEstimate: 45
        });
      }
    }

    // Send batch to backend
    if (eventsBatch.length > 0) {
      try {
        await axios.post(API_URL, { events: eventsBatch });
        console.log(`[Simulator] Emitted ${eventsBatch.length} camera detection events.`);
      } catch (err) {
        console.error(`[Simulator] Error sending batch to ${API_URL}:`, err.message);
      }
    }
  }

  start() {
    this.init();
    this.isRunning = true;
    console.log(`[Simulator] Started simulation loop (interval ${this.tickIntervalMs}ms)...`);
    setInterval(() => this.tick(), this.tickIntervalMs);
  }
}

const simulator = new TrafficSimulator();
simulator.start();
