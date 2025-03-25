const express = require('express');
const cors = require('cors');
const path = require('path');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const { config, fallbackToLocal } = require('./config/environment');
const { setupEnvironmentMiddleware } = require('./middlewares/environment.middleware');

// Import database
const db = require('./db/setup');

// Import security middleware
const { securityHeaders, additionalSecurityHeaders, corsMiddleware } = require('./middlewares/security.middleware');
const { apiLimiter, authLimiter, ipBlocker } = require('./middlewares/rate-limiter.middleware');
const { setCsrfToken, verifyCsrfToken } = require('./security/csrf');
const { wafMiddleware } = require('./security/waf');
const { requestLogger } = require('./utils/logger');
const { validateHeaders } = require('./middlewares/validator.middleware');
const { hstsMiddleware, setupServer } = require('./config/ssl');
const { getKeyManager } = require('./security/crypto');

// Inisialisasi express app
const app = express();

// Middleware dasar
app.use(corsMiddleware()); // Gunakan CORS middleware kustom untuk keamanan lebih baik
app.use(cookieParser()); // Diperlukan untuk CSRF dan JWT cookies
app.use(compression());
app.use(express.json({ limit: '10mb' })); // Batasi ukuran JSON untuk mengurangi risiko DoS
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware keamanan - urutan penting
app.use(ipBlocker);                   // Blok IP berbahaya terlebih dahulu
app.use(securityHeaders());           // Atur security headers (helmet di dalamnya)
app.use(hstsMiddleware());            // HSTS untuk memaksa HTTPS
app.use(requestLogger);               // Log semua request untuk monitoring
app.use(validateHeaders);             // Validasi header untuk mencegah header injection
app.use(apiLimiter);                  // Rate limiting global
app.use(wafMiddleware({               // Web Application Firewall
  rules: {
    sqlInjection: true,
    xss: true,
    commandInjection: true,
    pathTraversal: true,
    ddos: true,
    geoblocking: !config.isLocal      // Hanya aktif di production
  }
}));

// Setup middleware berdasarkan lingkungan
setupEnvironmentMiddleware(app);

// Setup CSRF protection untuk semua route kecuali API anak
app.use('/api/*', (req, res, next) => {
  if (!req.path.startsWith('/api/children')) {
    setCsrfToken(req, res, next);
  } else {
    next();
  }
});
app.use('/api/*', (req, res, next) => {
  if (!req.path.startsWith('/api/children')) {
    verifyCsrfToken(req, res, next);
  } else {
    next();
  }
});

// Tambahkan header keamanan tambahan
app.use(additionalSecurityHeaders());

// Inisialisasi Key Manager
try {
  getKeyManager();
  console.log('🔑 Cryptographic Key Manager initialized');
} catch (error) {
  console.error('❌ Error initializing Key Manager:', error.message);
}

// Rute API dasar
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to TRACAS Server API',
    version: '1.0.0',
    environment: config.isLocal ? 'local' : 'production',
    status: 'running',
    securityEnabled: true
  });
});

// Rute autentikasi dengan rate limiting khusus
app.use('/api/auth', authLimiter, require('./routes/auth.routes'));

// Rute untuk anak-anak (device anak)
app.use('/api/children', require('./routes/children.routes'));

// Rute untuk aplikasi (monitor & blokir)
app.use('/api/apps', require('./routes/apps.routes'));

// Rute untuk screen time
app.use('/api/screen-time', require('./routes/screenTime.routes'));

// Rute untuk lokasi & geofencing
app.use('/api/location', require('./routes/location.routes'));

// Rute untuk content filtering
app.use('/api/content-filter', require('./routes/contentFilter.routes'));

// Handler untuk 404
app.use((req, res) => {
  res.status(404).json({ 
    success: false,
    message: 'Route not found' 
  });
});

// Handler untuk error
app.use((err, req, res, next) => {
  const logger = require('./utils/logger');
  
  logger.error(`Server error: ${err.message}`, {
    stack: config.isLocal ? err.stack : undefined,
    path: req.path,
    method: req.method
  });
  
  res.status(500).json({
    success: false,
    message: 'Internal Server Error',
    error: config.isLocal ? err.message : undefined
  });
});

// Mulai server dengan SSL support jika diaktifkan
const server = setupServer(app, (serverInstance) => {
  // Callback saat server sudah dimulai
  
  // Inisialisasi Socket.io
  const io = require('socket.io')(serverInstance, {
    cors: {
      origin: config.isLocal ? '*' : process.env.CORS_ORIGINS?.split(',') || ['https://tracas.id'],
      methods: ['GET', 'POST']
    }
  });
  
  // Simpan instance socket.io untuk digunakan di service
  const socketModule = require('./sockets');
  socketModule.init(io);
  
  // Log status server
  const logger = require('./utils/logger');
  
  logger.info(`Server started`, {
    environment: config.isLocal ? 'LOCAL (TRACAS)' : 'PRODUCTION (Railway)',
    database: config.db.toUpperCase(),
    encryption: config.encryption ? 'ENABLED' : 'DISABLED',
    ai: config.ai.toUpperCase(),
    ssl: config.useSSL ? 'ENABLED' : 'DISABLED'
  });
  
  // Rotasi kunci JWT secara berkala
  if (!config.isLocal) {
    const { rotateKeysIfNeeded } = require('./security/jwt');
    // Periksa rotasi kunci setiap 12 jam
    setInterval(rotateKeysIfNeeded, 12 * 60 * 60 * 1000);
  }
});

// Graceful shutdown
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

/**
 * Fungsi untuk graceful shutdown
 */
async function gracefulShutdown() {
  const logger = require('./utils/logger');
  logger.info('Server shutting down gracefully');
  
  // Tutup koneksi socket
  const socketModule = require('./sockets');
  if (socketModule.io) {
    socketModule.io.close(() => {
      logger.info('Socket connections closed');
    });
  }
  
  // Tutup koneksi database
  try {
    await db.close();
    logger.info('Database connections closed');
  } catch (error) {
    logger.error(`Error closing database: ${error.message}`);
  }
  
  // Tutup server
  if (server && typeof server.close === 'function') {
    server.close(() => {
      logger.info('Server successfully closed');
      process.exit(0);
    });
  } else {
    logger.info('Server successfully closed');
    process.exit(0);
  }
  
  // Force shutdown jika melebihi timeout
  setTimeout(() => {
    logger.error('Timeout exceeded, forcing process exit');
    process.exit(1);
  }, 10000);
}

// Kelola error yang tidak tertangani
process.on('uncaughtException', (error) => {
  const logger = require('./utils/logger');
  
  logger.error(`Uncaught Exception: ${error.message}`, {
    stack: error.stack
  });
  
  // Jika error terkait Railway, fallback ke mode lokal
  if (error.message.includes('railway') || error.message.includes('postgresql')) {
    logger.warn('Attempting fallback to local mode');
    
    try {
      const newConfig = fallbackToLocal(error);
      // Di sini kita bisa mengimplementasikan logika untuk merestart server dengan konfigurasi baru
    } catch (fallbackError) {
      logger.error(`Failed to fallback to local mode: ${fallbackError.message}`);
    }
  }
  
  // Dalam produksi, jangan keluar dari proses karena uncaught exception
  if (!config.isLocal) {
    logger.info('Continuing execution despite error (production mode)');
  } else {
    process.exit(1);
  }
});

// Export server untuk testing
module.exports = server;