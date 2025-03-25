require('dotenv').config();

const config = {
  // Server
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 3000,
  
  // CORS
  CORS_ORIGIN: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['http://localhost:5173'],
  
  // Database
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: process.env.DB_PORT || 5432,
  DB_NAME: process.env.DB_NAME || 'tracas',
  DB_USER: process.env.DB_USER || 'postgres',
  DB_PASSWORD: process.env.DB_PASSWORD || '',
  DB_SSL: process.env.DB_SSL === 'true',
  
  // SQLite (Local Database)
  SQLITE_PATH: process.env.SQLITE_PATH || './data/tracas.db',
  
  // JWT
  JWT_SECRET: process.env.JWT_SECRET || 'rahasia2025TRACAS',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  
  // Encryption
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || '2828ee424a9e634ce56aa525073576875561091d060dd9efec4e0ec266a57b08',
  ENCRYPTION_IV: process.env.ENCRYPTION_IV || '1234567890123456',
  
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  LOG_TO_FILE: process.env.LOG_TO_FILE === 'true',
  LOG_RETENTION_DAYS: parseInt(process.env.LOG_RETENTION_DAYS || '14'),
  
  // Device
  DEVICE_ID: process.env.DEVICE_ID || 'tracas-server-instance-1'
};

module.exports = config; 