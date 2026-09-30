const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const Camera = require('../src/models/Camera');
const RoadGraph = require('../src/models/RoadGraph');
const Watchlist = require('../src/models/Watchlist');
const User = require('../src/models/User');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/netratrack';

async function seedDatabase() {
  try {
    console.log(`Connecting to MongoDB at ${MONGO_URI}...`);
    await mongoose.connect(MONGO_URI);
    console.log('MongoDB Connected successfully.');

    // 1. Seed Cameras
    const camerasDataPath = path.join(__dirname, '../../data/cameras.json');
    if (fs.existsSync(camerasDataPath)) {
      const cameras = JSON.parse(fs.readFileSync(camerasDataPath, 'utf8'));
      await Camera.deleteMany({});
      await Camera.insertMany(cameras);
      console.log(`[SEED] Seeded ${cameras.length} cameras into DB.`);
    } else {
      console.warn(`[SEED] cameras.json not found at ${camerasDataPath}`);
    }

    // 2. Seed RoadGraph
    const roadGraphDataPath = path.join(__dirname, '../../data/road_graph.json');
    if (fs.existsSync(roadGraphDataPath)) {
      const graphData = JSON.parse(fs.readFileSync(roadGraphDataPath, 'utf8'));
      await RoadGraph.deleteMany({});
      await RoadGraph.create({
        graphId: 'COIMBATORE_MAIN',
        nodes: graphData.nodes,
        edges: graphData.edges
      });
      console.log(`[SEED] Seeded RoadGraph with ${graphData.nodes.length} nodes & ${graphData.edges.length} edges.`);
    } else {
      console.warn(`[SEED] road_graph.json not found at ${roadGraphDataPath}`);
    }

    // 3. Seed Watchlist
    const watchlistDataPath = path.join(__dirname, '../../data/watchlist.json');
    if (fs.existsSync(watchlistDataPath)) {
      const watchlist = JSON.parse(fs.readFileSync(watchlistDataPath, 'utf8'));
      await Watchlist.deleteMany({});
      await Watchlist.insertMany(watchlist);
      console.log(`[SEED] Seeded ${watchlist.length} watchlist plates into DB.`);
    } else {
      console.warn(`[SEED] watchlist.json not found at ${watchlistDataPath}`);
    }

    // 4. Seed Default Users
    await User.deleteMany({});
    const passwordHash = await bcrypt.hash('password123', 10);
    const defaultUsers = [
      {
        username: 'admin',
        email: 'admin@netratrack.bel.in',
        passwordHash,
        role: 'admin'
      },
      {
        username: 'operator1',
        email: 'operator1@netratrack.bel.in',
        passwordHash,
        role: 'operator'
      },
      {
        username: 'viewer1',
        email: 'viewer1@netratrack.bel.in',
        passwordHash,
        role: 'viewer'
      }
    ];
    await User.insertMany(defaultUsers);
    console.log(`[SEED] Seeded ${defaultUsers.length} default system users (admin, operator, viewer).`);

    console.log('[SEED] Database seeding complete!');
  } catch (error) {
    console.error('[SEED] Error seeding database:', error);
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB Disconnected.');
  }
}

seedDatabase();
