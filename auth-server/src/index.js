const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const config = require('./config');
const dbHelper = require('./db/database');
const { apiRateLimiter } = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const giftRoutes = require('./routes/giftRoutes');

const app = express();

// Enable trust proxy for Render / Cloudflare reverse proxies
app.set('trust proxy', 1);

// Security Headers
app.use(helmet({
  contentSecurityPolicy: false // Allow inline scripts/styles for Admin Dashboard Web UI
}));

// CORS Configuration
app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key']
}));

// Body parsing with size limits
app.use(express.json({ limit: '10kb' }));

// General Rate Limiting
app.use(apiRateLimiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    service: 'TavLive Remote Auth API',
    timestamp: new Date().toISOString()
  });
});

// Serve Admin Panel Web Dashboard (Modo Dueño)
app.get(['/admin', '/admin/dashboard'], (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});


// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/gifts', giftRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found.' });
});

// Global Error Handler
app.use(errorHandler);

// Start server after DB initialization
async function startServer() {
  await dbHelper.init();
  const PORT = config.PORT;
  const server = app.listen(PORT, () => {
    console.info(`[TavLive Auth API] Server running on port ${PORT} (${config.NODE_ENV})`);
  });
  return { app, server, dbHelper };
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error('Failed to start TavLive Auth API:', err);
    process.exit(1);
  });
}

module.exports = { app, startServer };
