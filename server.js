require('dotenv').config();
const express = require('express');
const path = require('path');
const http = require('http');

const accountRoutes = require('./src/routes/account');
const positionsRoutes = require('./src/routes/positions');
const ordersRoutes = require('./src/routes/orders');
const marketRoutes = require('./src/routes/market');
const portfolioRoutes = require('./src/routes/portfolio');
const assetsRoutes = require('./src/routes/assets');
const activitiesRoutes = require('./src/routes/activities');
const websocket = require('./src/websocket');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/account', accountRoutes);
app.use('/api/positions', positionsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/assets', assetsRoutes);
app.use('/api/activities', activitiesRoutes);

const server = http.createServer(app);

websocket.initWebSocketServer(server);

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║    ALPACA TRADING DASHBOARD                            ║
║    Running on http://localhost:${PORT}                  ║
║    Paper Trading Mode                                ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

process.on('SIGINT', () => {
  console.log('\nShutting down...');
  websocket.closeWebSocket();
  server.close(() => {
    process.exit(0);
  });
});

module.exports = app;