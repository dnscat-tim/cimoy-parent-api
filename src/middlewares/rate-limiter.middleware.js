const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const { createClient } = require('redis');
const { config } = require('../config/environment');
const { securityLogger } = require('../utils/logger');

// Redis client untuk rate limiting (jika tersedia)
let redisClient;
let isRedisAvailable = false;

// Coba hubungkan ke Redis jika dalam mode produksi
if (!config.isLocal && config.redis && config.redis.url) {
  try {
    redisClient = createClient({
      url: config.redis.url,
      password: config.redis.password,
    });
    
    redisClient.on('connect', () => {
      console.log('Redis connected for rate limiting');
      isRedisAvailable = true;
    });
    
    redisClient.on('error', (err) => {
      console.error('Redis connection error:', err);
      isRedisAvailable = false;
    });
    
    redisClient.connect().catch(console.error);
  } catch (error) {
    console.error('Error setting up Redis client:', error);
  }
}

// Middleware untuk logging rate limit hit
const rateLimitLogger = (req, options) => {
  securityLogger.logIntrusion('Rate limit reached', {
    ip: req.ip,
    path: req.path,
    method: req.method,
    userAgent: req.get('user-agent'),
    severity: options.isAuth ? 'medium' : 'low',
  });
};

// Default options
const defaultLimiterOptions = {
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 100, // limit permintaan per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Terlalu banyak permintaan, silakan coba lagi nanti.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  skip: (req) => {
    // Skip rate limit untuk admin dari localhost jika di lingkungan local
    if (config.isLocal && req.ip === '127.0.0.1' && req.user && req.user.role === 'admin') {
      return true;
    }
    return false;
  },
  handler: (req, res, next, options) => {
    rateLimitLogger(req, options);
    res.status(429).json(options.message);
  }
};

// Helper untuk membuat limiter dengan opsi kustom
const createLimiter = (options = {}) => {
  const limiterOptions = {
    ...defaultLimiterOptions,
    ...options
  };
  
  // Gunakan Redis store jika tersedia
  if (isRedisAvailable && redisClient) {
    limiterOptions.store = new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
      prefix: options.prefix || 'rl:'
    });
  }
  
  return rateLimit(limiterOptions);
};

// Limiter untuk API secara umum
const apiLimiter = createLimiter({
  prefix: 'api:general:'
});

// Limiter yang lebih ketat untuk endpoint autentikasi
const authLimiter = createLimiter({
  windowMs: 30 * 60 * 1000, // 30 menit
  max: 10, // 10 upaya per 30 menit
  prefix: 'api:auth:',
  isAuth: true,
  message: {
    success: false,
    message: 'Terlalu banyak upaya login, silakan coba lagi setelah 30 menit.',
    code: 'AUTH_ATTEMPTS_EXCEEDED'
  }
});

// Limiter untuk endpoint sensitif
const sensitiveLimiter = createLimiter({
  windowMs: 60 * 60 * 1000, // 1 jam
  max: 30, // 30 permintaan per jam
  prefix: 'api:sensitive:',
  message: {
    success: false,
    message: 'Terlalu banyak permintaan ke endpoint sensitif, silakan coba lagi nanti.',
    code: 'SENSITIVE_RATE_EXCEEDED'
  }
});

// Middleware blokir IP spesifik
const blockList = new Set();

const updateBlockList = (ipList) => {
  // Reset dan mengisi ulang blocklist
  blockList.clear();
  ipList.forEach(ip => blockList.add(ip));
};

const ipBlocker = (req, res, next) => {
  const clientIp = req.ip;
  
  if (blockList.has(clientIp)) {
    securityLogger.logIntrusion('Blocked IP attempted access', {
      ip: clientIp,
      path: req.path,
      method: req.method,
      userAgent: req.get('user-agent'),
      severity: 'medium',
    });
    
    return res.status(403).json({
      success: false,
      message: 'Akses dari IP Anda diblokir. Silakan hubungi administrator.',
      code: 'IP_BLOCKED'
    });
  }
  
  next();
};

module.exports = {
  apiLimiter,
  authLimiter,
  sensitiveLimiter,
  createLimiter,
  ipBlocker,
  updateBlockList
}; 