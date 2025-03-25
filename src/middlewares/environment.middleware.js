const { config, validateSignature } = require('../config/environment');
const rateLimit = require('express-rate-limit');

/**
 * Middleware untuk security handshake
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware function
 */
const securityHandshake = (req, res, next) => {
  // Jika dalam mode lokal, tidak perlu validasi signature
  if (config.isLocal) {
    return next();
  }
  
  const signature = req.headers['x-tracas-sign'];
  
  if (!signature || !validateSignature(signature)) {
    return res.status(403).json({
      success: false,
      message: 'Akses ditolak. Signature tidak valid.'
    });
  }
  
  next();
};

/**
 * Middleware untuk logging adaptif
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware function
 */
const adaptiveLogging = (req, res, next) => {
  const start = Date.now();
  
  // Catat waktu respons
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.headers['user-agent'],
      ip: req.ip
    };
    
    if (config.isLocal) {
      // Logging detail untuk lingkungan lokal
      console.log(`🔍 ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
    } else {
      // Logging terbatas untuk lingkungan produksi
      if (res.statusCode >= 400) {
        console.error(`❌ ERROR: ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
        // Di produksi, kirim ke Elasticsearch (implementasi stub)
        // logToElasticsearch(logData);
      }
    }
  });
  
  next();
};

/**
 * Middleware rate limiting untuk lingkungan produksi
 */
const productionRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 100, // batasi setiap IP hingga 100 request per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Terlalu banyak request dari IP ini, coba lagi nanti'
  },
  skip: (req) => config.isLocal // Skip rate limiting di lingkungan lokal
});

/**
 * Middleware enkripsi untuk lingkungan produksi
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware function
 */
const encryptionMiddleware = (req, res, next) => {
  if (config.encryption) {
    // Tambahkan header keamanan tambahan
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Content-Security-Policy', "default-src 'self'");
  }
  
  next();
};

/**
 * Setup middleware berdasarkan lingkungan
 * @param {Object} app - Express app
 */
const setupEnvironmentMiddleware = (app) => {
  // Middleware dasar yang selalu diaplikasikan
  app.use(adaptiveLogging);
  app.use(encryptionMiddleware);
  
  // Middleware khusus untuk lingkungan produksi
  if (!config.isLocal) {
    app.use(securityHandshake);
    app.use(productionRateLimiter);
  }
  
  // Tambahkan route untuk status server
  app.get('/tracas-status', (req, res) => {
    const { getServerStatus } = require('../config/environment');
    if (config.isLocal) {
      res.json(getServerStatus());
    } else {
      res.status(404).json({ success: false, message: 'Not found' });
    }
  });
  
  app.get('/railway-status', (req, res) => {
    const { getServerStatus } = require('../config/environment');
    if (!config.isLocal) {
      res.json(getServerStatus());
    } else {
      res.status(404).json({ success: false, message: 'Not found' });
    }
  });
};

module.exports = {
  securityHandshake,
  adaptiveLogging,
  productionRateLimiter,
  encryptionMiddleware,
  setupEnvironmentMiddleware
}; 