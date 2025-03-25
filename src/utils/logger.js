const winston = require('winston');
const fs = require('fs');
const path = require('path');
const { config } = require('../config/environment');

// Buat folder log jika belum ada
const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Format dasar untuk semua log
const defaultFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Format custom untuk console output
const consoleFormat = winston.format.printf(({ level, message, timestamp, ...meta }) => {
  const metaString = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
  return `${timestamp} [${level.toUpperCase()}]: ${message}${metaString}`;
});

// Logger utama
const logger = winston.createLogger({
  level: config.logLevel || 'info',
  format: defaultFormat,
  defaultMeta: { service: 'tracas-api' },
  transports: [
    // File untuk semua log level info ke atas
    new winston.transports.File({ 
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // File khusus untuk error
    new winston.transports.File({ 
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // File khusus untuk log keamanan (warning ke atas)
    new winston.transports.File({ 
      filename: path.join(logDir, 'security.log'),
      level: 'warn',
      maxsize: 5242880, // 5MB
      maxFiles: 10,
    }),
  ],
});

// Tambahkan console transport di development/local
if (config.isLocal || process.env.NODE_ENV === 'development') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      consoleFormat
    )
  }));
}

// Logger khusus untuk keamanan
const securityLogger = logger.child({ module: 'security' });

// Helper function untuk log upaya intrusi
securityLogger.logIntrusion = (message, data) => {
  securityLogger.warn(`INTRUSION_ATTEMPT: ${message}`, {
    ...data,
    timestamp: new Date().toISOString()
  });
  
  // Buat alert untuk upaya intrusi serius
  if (data.severity === 'high') {
    alertAdmins(message, data);
  }
};

// Helper function untuk log autentikasi
securityLogger.logAuth = (success, message, data) => {
  const level = success ? 'info' : 'warn';
  securityLogger[level](`AUTH_${success ? 'SUCCESS' : 'FAILURE'}: ${message}`, {
    ...data,
    timestamp: new Date().toISOString()
  });
  
  // Buat alert untuk upaya login gagal berulang
  if (!success && data.attempts && data.attempts > 3) {
    securityLogger.logIntrusion('Multiple failed login attempts', {
      ...data,
      severity: data.attempts > 5 ? 'high' : 'medium'
    });
  }
};

// Helper function untuk log aktivitas admin
securityLogger.logAdmin = (action, admin, data) => {
  securityLogger.info(`ADMIN_ACTION: ${action}`, {
    admin,
    ...data,
    timestamp: new Date().toISOString()
  });
};

// Helper function untuk mengirim alert ke admin (placeholder)
function alertAdmins(message, data) {
  // Implementasi notifikasi (email, SMS, dll) bisa ditambahkan di sini
  console.error(`SECURITY ALERT: ${message}`, data);
  
  // Di implementasi nyata, bisa mengirim email/SMS/webhook
  // sendEmail('admin@example.com', 'Security Alert', `${message}\n${JSON.stringify(data, null, 2)}`);
}

// Middleware untuk express request logging
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Tambahkan listener untuk 'finish' event
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 500 ? 'error' : 
                     res.statusCode >= 400 ? 'warn' : 'info';
    
    logger[logLevel](`${req.method} ${req.originalUrl}`, {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userId: req.user ? req.user.id : undefined,
      role: req.user ? req.user.role : undefined,
    });
    
    // Log API request yang gagal ke security log
    if (res.statusCode >= 400) {
      const isSuspicious = res.statusCode === 403 || 
                          (res.statusCode === 400 && req.originalUrl.includes('/auth'));
      
      if (isSuspicious) {
        securityLogger.logIntrusion('Suspicious API request', {
          method: req.method,
          url: req.originalUrl,
          ip: req.ip,
          userAgent: req.get('user-agent'),
          statusCode: res.statusCode,
          body: req.body ? JSON.stringify(req.body).substring(0, 200) : '',
          severity: 'low'
        });
      }
    }
  });
  
  next();
};

module.exports = logger;
module.exports.securityLogger = securityLogger;
module.exports.requestLogger = requestLogger; 