require('dotenv').config();
const path = require('path');
const express = require('express');
const http = require('http');
const cors = require('cors');
const mongoose = require('mongoose');
const { Server } = require('socket.io');

const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const server = http.createServer(app);

// ML Service Proxy Routing (must be before body parsers for streaming multipart uploads)
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000';
app.use('/ml', createProxyMiddleware({
  target: ML_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { '^/ml': '' }
}));

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Attach io to req for controllers
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Serve static React production build
const clientDistPath = path.join(__dirname, '../client/dist');
app.use(express.static(clientDistPath));

// Routes
const eventsRouter = require('./src/routes/events');
const trajectoryRouter = require('./src/routes/trajectory');
const analyticsRouter = require('./src/routes/analytics');
const alertsRouter = require('./src/routes/alerts');
const watchlistRouter = require('./src/routes/watchlist');
const llmRouter = require('./src/routes/llm');
const camerasRouter = require('./src/routes/cameras');

app.use('/api/events', eventsRouter);
app.use('/api/trajectory', trajectoryRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/watchlist', watchlistRouter);
app.use('/api/llm', llmRouter);
app.use('/api/cameras', camerasRouter);

// Basic Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'HEALTHY',
    service: 'NetraTrack API Server',
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'CONNECTED' : 'DISCONNECTED'
  });
});

// Fallback to index.html for client-side React routes
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// Socket.IO Connection Handler
io.on('connection', (socket) => {
  console.log(`[Socket.IO] Client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/netratrack';

server.listen(PORT, () => {
  console.log(`NetraTrack Express server & Dashboard running on port ${PORT}`);
});

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('Successfully connected to MongoDB');
  })
  .catch((err) => {
    console.warn('MongoDB connection warning (running in standalone memory mode):', err.message);
  });

module.exports = { app, server, io };
