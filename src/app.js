require('dotenv').config();
const express = require('express');
const connectDB = require('./config/db');
const { connectRedis } = require('./config/cache');
const leadRoutes = require('./routes/leads');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// ── Middleware
app.use(express.json());

// ── Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Routes
app.use('/leads', leadRoutes);

// ── 404 for unknown routes
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── Global error handler (must be last)
app.use(errorHandler);

// ── Start server
const PORT = process.env.PORT || 3000;

const start = async () => {
  await connectDB();
  await connectRedis(); // graceful — won't crash if Redis is down
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
};

start();
