const winston = require('winston');
const { format, transports } = winston;
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');
const { config } = require('../config/environment');

// Pastikan direktori logs ada
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Format untuk log
const logFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.errors({ stack: true }),
  format.splat(),
  format.json()
);

// Definisikan format konsol yang berbeda untuk lingkungan lokal vs produksi
const consoleFormatLocal = format.combine(
  format.colorize(),
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.printf(
    info => {
      const { timestamp, level, message, ...rest } = info;
      const restString = Object.keys(rest).length ? JSON.stringify(rest, null, 2) : '';
      
      // Gunakan emoji berdasarkan level log
      let emoji = '';
      switch (level) {
        case 'info':
          emoji = '📢';
          break;
        case 'warn':
          emoji = '⚠️';
          break;
        case 'error':
          emoji = '❌';
          break;
        case 'debug':
          emoji = '🔍';
          break;
        default:
          emoji = '📝';
      }
      
      return `${timestamp} ${emoji} ${level}: ${message} ${restString}`;
    }
  )
);

const consoleFormatProduction = format.combine(
  format.timestamp(),
  format.printf(
    info => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// Konfigurasi transport untuk rotasi file
const fileRotateTransport = new DailyRotateFile({
  filename: path.join(logDir, '%DATE%-app.log'),
  datePattern: 'YYYY-MM-DD',
  maxFiles: '14d',
  maxSize: '20m',
  level: 'info'
});

// Transport khusus untuk log error
const errorFileRotateTransport = new DailyRotateFile({
  filename: path.join(logDir, 'error.log'),
  datePattern: 'YYYY-MM-DD',
  maxFiles: '30d',
  maxSize: '20m',
  level: 'error'
});

// Buat logger dengan konfigurasi berdasarkan lingkungan
const logger = winston.createLogger({
  level: config.isLocal ? 'debug' : 'warn',
  format: logFormat,
  defaultMeta: { service: 'tracas-api', environment: config.isLocal ? 'local' : 'production' },
  transports: [
    // File untuk semua log dengan level info
    fileRotateTransport,
    // File khusus untuk error
    errorFileRotateTransport
  ]
});

// Tambahkan transport konsol dengan format yang sesuai
logger.add(
  new transports.Console({
    format: config.isLocal ? consoleFormatLocal : consoleFormatProduction,
    level: config.isLocal ? 'debug' : 'warn'
  })
);

// Metode untuk mencatat log API request
logger.logRequest = (req, res, responseTime) => {
  const { method, originalUrl, ip, body } = req;
  
  // Catat informasi request
  logger.info({
    type: 'api_request',
    method,
    url: originalUrl,
    ip,
    statusCode: res.statusCode,
    responseTime: `${responseTime}ms`,
    // Jangan mencatat data sensitif di produksi
    body: config.isLocal ? JSON.stringify(body).substring(0, 500) : '[REDACTED]'
  });
};

// Metode untuk mencatat error API
logger.logError = (req, err) => {
  const { method, originalUrl, ip, body } = req;
  
  logger.error({
    type: 'api_error',
    method,
    url: originalUrl,
    ip,
    error: err.message,
    stack: config.isLocal ? err.stack : undefined,
    // Jangan mencatat data sensitif di produksi
    body: config.isLocal ? JSON.stringify(body).substring(0, 500) : '[REDACTED]'
  });
};

// Fungsi untuk mengirim log ke Elasticsearch (untuk produksi)
logger.sendToElasticsearch = (logData) => {
  if (!config.isLocal) {
    // Implementasi pengiriman log ke Elasticsearch
    // Dalam implementasi sesungguhnya, akan menggunakan klien Elasticsearch
    logger.debug('Mengirim log ke Elasticsearch', { logData });
  }
};

module.exports = logger; 