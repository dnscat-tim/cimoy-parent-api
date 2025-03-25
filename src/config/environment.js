/**
 * Konfigurasi environment untuk aplikasi
 * Mendeteksi otomatis apakah berjalan di:
 * - Render
 * - Railway
 * - Atau mode lokal
 */

require('dotenv').config();

// Konstanta lingkungan
const ENV = {
  DEVELOPMENT: 'development',
  PRODUCTION: 'production',
  TEST: 'test'
};

// Deteksi platform
const isRender = !!process.env.RENDER || !!process.env.RENDER_EXTERNAL_URL;
const isRailway = !!process.env.RAILWAY_STATIC_URL;
const isLocal = !isRender && !isRailway;

// Base config
const config = {
  env: process.env.NODE_ENV || ENV.DEVELOPMENT,
  port: parseInt(process.env.PORT || '8080', 10),
  isProduction: process.env.NODE_ENV === ENV.PRODUCTION,
  isTest: process.env.NODE_ENV === ENV.TEST,
  isDevelopment: process.env.NODE_ENV === ENV.DEVELOPMENT || !process.env.NODE_ENV,
  
  // Platform detection
  isRender,
  isRailway,
  isLocal,
  
  // Database
  db: process.env.DB_TYPE || (isLocal ? 'sqlite' : 'postgres'),
  dbUrl: process.env.DATABASE_URL,
  
  // Redis
  redisUrl: process.env.REDIS_URL,
  
  // Security
  jwt: {
    secret: process.env.JWT_SECRET || 'default-development-jwt-secret',
    expiresIn: process.env.JWT_EXPIRY || '1h',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'default-refresh-secret',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRY || '7d'
  },
  
  encryption: process.env.ENCRYPTION_KEY,
  
  // CORS
  cors: {
    origins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['*'],
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
  },
  
  // Kids API
  kids: {
    apiKey: process.env.KIDS_API_KEY,
    allowedOrigins: process.env.ALLOWED_KIDS_ORIGINS ? 
      process.env.ALLOWED_KIDS_ORIGINS.split(',') : ['*']
  },
  
  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'combined'
  },
  
  // SSL/TLS
  useSSL: isRender || isRailway || (process.env.USE_SSL === 'true'),
  
  // Paths
  paths: {
    data: process.env.DATA_PATH || './data',
    logs: process.env.LOGS_PATH || './logs'
  }
};

/**
 * Fallback ke mode lokal jika deployment cloud gagal
 */
function fallbackToLocal(error) {
  console.warn(`⚠️ Switching to local mode due to error: ${error.message}`);
  
  const newConfig = {
    ...config,
    isLocal: true,
    isRender: false,
    isRailway: false,
    db: 'sqlite',
    useSSL: false
  };
  
  return newConfig;
}

module.exports = {
  config,
  fallbackToLocal,
  ENV
}; 