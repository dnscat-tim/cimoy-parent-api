const { config } = require('../config/environment');
const { securityLogger } = require('../utils/logger');
const { updateBlockList } = require('../middlewares/rate-limiter.middleware');
const geoip = require('geoip-lite');

/**
 * WAF (Web Application Firewall) untuk TRACAS API
 * Melindungi dari serangan umum seperti SQLi, XSS, dan DDoS
 */
class WAF {
  constructor() {
    // Status WAF
    this.isEnabled = config.isLocal ? false : true;
    
    // Aturan yang aktif
    this.activeRules = {
      sqlInjection: true,
      xss: true,
      commandInjection: true,
      path_traversal: true,
      ddos: true,
      geoblocking: !config.isLocal, // Hanya aktif di production
    };
    
    // Hitungan request per IP
    this.requestCounts = {};
    
    // Threshold untuk anomaly detection
    this.thresholds = {
      requestsPerMinute: 100,
      requestsPerSecond: 10,
      suspiciousPatternScore: 5,
      badRequestRatio: 0.5, // 50% bad request = suspicious
    };
    
    // Cache untuk IP yang diblokir
    this.blockedIPs = new Set();
    
    // Negara yang diizinkan (kosong = semua diizinkan)
    this.allowedCountries = (process.env.ALLOWED_COUNTRIES || 'ID,SG,MY,US').split(',');
    
    // List regex untuk deteksi serangan
    this.attackPatterns = {
      sqlInjection: [
        /'.*--/i,
        /union.*select/i,
        /exec.*sp_/i,
        /insert.*into.*values/i,
        /select.*from/i,
        /delete.*from/i,
        /drop.*table/i,
        /waitfor.*delay/i,
        /;.*;/i,
        /'.*OR.*'--/i,
        /'.*OR.*1=1--/i
      ],
      xss: [
        /<script[^>]*>/i,
        /javascript:[^"]*/i,
        /onerror=[^"]*/i,
        /onload=[^"]*/i,
        /onclick=[^"]*/i,
        /eval\([^)]*\)/i,
        /alert\([^)]*\)/i,
        /document\.cookie/i,
        /document\.location/i,
        /document\.write/i
      ],
      commandInjection: [
        /\|\s*(?:cmd|command|powershell|bash|sh|ksh|csh)/i,
        /;\s*(?:cmd|command|powershell|bash|sh|ksh|csh)/i,
        /`.*`/i,
        /system\(.*\)/i,
        /exec\(.*\)/i,
        /\$\([^)]*\)/i,
        /\|\s*(?:ls|dir|cat|ps|netstat)/i
      ],
      pathTraversal: [
        /\.\.\/\.\.\/\.\.\//i,
        /\.\.\\\.\.\\\.\.\/\//i,
        /etc\/passwd/i,
        /etc\/shadow/i,
        /\/proc\/self\/environ/i,
        /\/var\/log\//i,
        /\/windows\/system32\//i,
        /c:\\windows\\system32/i
      ],
      filenames: [
        /\.htaccess/i,
        /\.htpasswd/i,
        /config\.php/i,
        /wp-config\.php/i,
        /config\.ini/i,
        /\.env/i,
        /\.git\//i,
        /\.svn\//i
      ]
    };
    
    // Inisialisasi WAF
    this.initialize();
  }
  
  /**
   * Inisialisasi WAF
   */
  initialize() {
    // Inisialisasi cleaners
    setInterval(() => this.cleanRequestCounts(), 60000); // Bersihkan setiap menit
    
    // Logging
    if (this.isEnabled) {
      console.log(`🔒 WAF Enabled with rules:`, 
        Object.entries(this.activeRules)
          .filter(([_, enabled]) => enabled)
          .map(([rule]) => rule)
          .join(', ')
      );
      
      if (this.activeRules.geoblocking) {
        console.log(`🌍 Geoblocking active. Allowed countries: ${this.allowedCountries.join(', ')}`);
      }
    } else {
      console.log(`⚠️ WAF is disabled. Enable it in production for better security.`);
    }
  }
  
  /**
   * Analisis payload untuk mendeteksi serangan
   * @param {Object} payload - Payload untuk dianalisis
   * @param {string} category - Kategori serangan
   * @returns {Object} Hasil analisis
   */
  analyzePayload(payload, category) {
    if (!payload || !this.attackPatterns[category]) {
      return { detected: false, score: 0, matches: [] };
    }
    
    let score = 0;
    const matches = [];
    
    // Convert object to string for analysis if needed
    const payloadStr = typeof payload === 'object' ? JSON.stringify(payload) : payload;
    
    // Periksa tiap pattern
    for (const pattern of this.attackPatterns[category]) {
      if (pattern.test(payloadStr)) {
        score++;
        matches.push(pattern.toString());
      }
    }
    
    const detected = score > 0;
    return { detected, score, matches };
  }
  
  /**
   * Periksa request untuk semua jenis serangan
   * @param {Object} req - Express request
   * @returns {Object} Hasil pemeriksaan
   */
  inspectRequest(req) {
    if (!this.isEnabled) {
      return { blocked: false };
    }
    
    const clientIp = req.ip || req.connection.remoteAddress;
    
    // Jika IP sudah diblokir, langsung tolak
    if (this.blockedIPs.has(clientIp)) {
      return {
        blocked: true,
        reason: 'IP address telah diblokir'
      };
    }
    
    // Track request count
    this.trackRequest(clientIp);
    
    // Periksa geolocation
    if (this.activeRules.geoblocking) {
      const geoResult = this.checkGeolocation(clientIp);
      if (geoResult.blocked) {
        return geoResult;
      }
    }
    
    // Jika method GET, periksa hanya query params
    if (req.method === 'GET') {
      const urlResult = this.inspectUrl(req.url);
      if (urlResult.blocked) {
        this.logAttack(clientIp, 'URL', urlResult);
        return urlResult;
      }
    } 
    // Periksa semua untuk POST/PUT/DELETE
    else {
      // Periksa SQL Injection di body dan params
      if (this.activeRules.sqlInjection) {
        const sqlResult = this.analyzePayload(req.body, 'sqlInjection');
        if (sqlResult.detected) {
          this.logAttack(clientIp, 'SQL Injection', sqlResult);
          return {
            blocked: true,
            reason: 'Potensi SQL Injection terdeteksi',
            category: 'SQL_INJECTION',
            matches: sqlResult.matches
          };
        }
      }
      
      // Periksa XSS
      if (this.activeRules.xss) {
        const xssResult = this.analyzePayload(req.body, 'xss');
        if (xssResult.detected) {
          this.logAttack(clientIp, 'XSS', xssResult);
          return {
            blocked: true,
            reason: 'Potensi Cross-Site Scripting (XSS) terdeteksi',
            category: 'XSS',
            matches: xssResult.matches
          };
        }
      }
      
      // Periksa Command Injection
      if (this.activeRules.commandInjection) {
        const cmdResult = this.analyzePayload(req.body, 'commandInjection');
        if (cmdResult.detected) {
          this.logAttack(clientIp, 'Command Injection', cmdResult);
          return {
            blocked: true,
            reason: 'Potensi Command Injection terdeteksi',
            category: 'COMMAND_INJECTION',
            matches: cmdResult.matches
          };
        }
      }
      
      // Periksa Path Traversal
      if (this.activeRules.path_traversal) {
        const pathResult = this.analyzePayload(req.url, 'pathTraversal');
        if (pathResult.detected) {
          this.logAttack(clientIp, 'Path Traversal', pathResult);
          return {
            blocked: true,
            reason: 'Potensi Path Traversal terdeteksi',
            category: 'PATH_TRAVERSAL',
            matches: pathResult.matches
          };
        }
      }
    }
    
    // Periksa DDoS
    if (this.activeRules.ddos) {
      const ddosResult = this.checkDDoS(clientIp);
      if (ddosResult.blocked) {
        return ddosResult;
      }
    }
    
    return { blocked: false };
  }
  
  /**
   * Periksa URL untuk potensi serangan
   * @param {string} url - URL untuk diperiksa
   * @returns {Object} Hasil pemeriksaan
   */
  inspectUrl(url) {
    // Periksa SQL Injection di URL
    const sqlResult = this.analyzePayload(url, 'sqlInjection');
    if (sqlResult.detected) {
      return {
        blocked: true,
        reason: 'Potensi SQL Injection terdeteksi di URL',
        category: 'SQL_INJECTION',
        matches: sqlResult.matches
      };
    }
    
    // Periksa XSS di URL
    const xssResult = this.analyzePayload(url, 'xss');
    if (xssResult.detected) {
      return {
        blocked: true,
        reason: 'Potensi XSS terdeteksi di URL',
        category: 'XSS',
        matches: xssResult.matches
      };
    }
    
    // Periksa Path Traversal di URL
    const pathResult = this.analyzePayload(url, 'pathTraversal');
    if (pathResult.detected) {
      return {
        blocked: true,
        reason: 'Potensi Path Traversal terdeteksi di URL',
        category: 'PATH_TRAVERSAL',
        matches: pathResult.matches
      };
    }
    
    // Periksa akses ke file sensitif
    const fileResult = this.analyzePayload(url, 'filenames');
    if (fileResult.detected) {
      return {
        blocked: true,
        reason: 'Akses ke file sensitif terdeteksi',
        category: 'SENSITIVE_FILE_ACCESS',
        matches: fileResult.matches
      };
    }
    
    return { blocked: false };
  }
  
  /**
   * Periksa DDoS berdasarkan request frequency
   * @param {string} clientIp - IP client
   * @returns {Object} Hasil pemeriksaan
   */
  checkDDoS(clientIp) {
    // Ambil data request
    const requestData = this.requestCounts[clientIp];
    if (!requestData) {
      return { blocked: false };
    }
    
    const now = Date.now();
    const secondWindow = now - 1000; // 1 detik
    const minuteWindow = now - 60000; // 1 menit
    
    // Count requests in last second and minute
    const requestsLastSecond = requestData.timestamps.filter(time => time > secondWindow).length;
    const requestsLastMinute = requestData.timestamps.filter(time => time > minuteWindow).length;
    
    // Periksa threshold
    if (requestsLastSecond > this.thresholds.requestsPerSecond || 
        requestsLastMinute > this.thresholds.requestsPerMinute) {
      
      // Block IP
      this.blockIP(clientIp, 'DDoS', {
        requestsPerSecond: requestsLastSecond,
        requestsPerMinute: requestsLastMinute
      });
      
      return {
        blocked: true,
        reason: 'Rate limit terlampaui, potensi DDoS',
        category: 'DDOS_PROTECTION',
        details: {
          requestsPerSecond: requestsLastSecond,
          requestsPerMinute: requestsLastMinute,
          thresholdPerSecond: this.thresholds.requestsPerSecond,
          thresholdPerMinute: this.thresholds.requestsPerMinute
        }
      };
    }
    
    return { blocked: false };
  }
  
  /**
   * Periksa geolocation IP
   * @param {string} clientIp - IP client
   * @returns {Object} Hasil pemeriksaan
   */
  checkGeolocation(clientIp) {
    // Skip localhost dan private IPs
    if (clientIp === '127.0.0.1' || clientIp === '::1' || clientIp.startsWith('192.168.') || clientIp.startsWith('10.')) {
      return { blocked: false };
    }
    
    // Lookup IP
    const geo = geoip.lookup(clientIp);
    
    // Jika geo data tidak ditemukan atau tidak ada country, izinkan
    if (!geo || !geo.country) {
      return { blocked: false };
    }
    
    // Jika country tidak dalam allowed list, blokir
    if (this.allowedCountries.length > 0 && !this.allowedCountries.includes(geo.country)) {
      this.logAttack(clientIp, 'Geoblocking', {
        country: geo.country,
        allowedCountries: this.allowedCountries
      });
      
      return {
        blocked: true,
        reason: `Akses dari negara ${geo.country} tidak diizinkan`,
        category: 'GEO_BLOCKING',
        details: {
          country: geo.country,
          allowedCountries: this.allowedCountries
        }
      };
    }
    
    return { blocked: false };
  }
  
  /**
   * Track request untuk analisis
   * @param {string} clientIp - IP client
   */
  trackRequest(clientIp) {
    const now = Date.now();
    
    if (!this.requestCounts[clientIp]) {
      this.requestCounts[clientIp] = {
        timestamps: [now],
        badRequests: 0,
        totalRequests: 1
      };
    } else {
      this.requestCounts[clientIp].timestamps.push(now);
      this.requestCounts[clientIp].totalRequests++;
    }
  }
  
  /**
   * Record bad request untuk analisis
   * @param {string} clientIp - IP client
   */
  recordBadRequest(clientIp) {
    if (this.requestCounts[clientIp]) {
      this.requestCounts[clientIp].badRequests++;
      
      // Periksa rasio bad request
      const { badRequests, totalRequests } = this.requestCounts[clientIp];
      if (totalRequests > 10 && badRequests / totalRequests > this.thresholds.badRequestRatio) {
        this.blockIP(clientIp, 'High bad request ratio', {
          badRequests,
          totalRequests,
          ratio: badRequests / totalRequests
        });
      }
    }
  }
  
  /**
   * Blokir IP address
   * @param {string} clientIp - IP client yang akan diblokir
   * @param {string} reason - Alasan pemblokiran
   * @param {Object} details - Detail tambahan
   */
  blockIP(clientIp, reason, details = {}) {
    // Skip localhost
    if (clientIp === '127.0.0.1' || clientIp === '::1') {
      return;
    }
    
    // Add to blocklist
    this.blockedIPs.add(clientIp);
    
    // Update global blocklist
    updateBlockList(Array.from(this.blockedIPs));
    
    // Log blocking
    securityLogger.logIntrusion(`IP blocked: ${clientIp}`, {
      ip: clientIp,
      reason,
      details,
      severity: 'high',
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Log serangan
   * @param {string} clientIp - IP client
   * @param {string} attackType - Jenis serangan
   * @param {Object} details - Detail serangan
   */
  logAttack(clientIp, attackType, details = {}) {
    securityLogger.logIntrusion(`${attackType} attack detected`, {
      ip: clientIp,
      attackType,
      details,
      severity: 'high',
      timestamp: new Date().toISOString()
    });
    
    // Record as bad request
    this.recordBadRequest(clientIp);
  }
  
  /**
   * Bersihkan data request count yang sudah lama
   */
  cleanRequestCounts() {
    const now = Date.now();
    const cutoff = now - 300000; // 5 menit
    
    // Clean up old request timestamps
    for (const ip in this.requestCounts) {
      this.requestCounts[ip].timestamps = this.requestCounts[ip].timestamps.filter(time => time > cutoff);
      
      // If no timestamps left, remove the entry
      if (this.requestCounts[ip].timestamps.length === 0) {
        delete this.requestCounts[ip];
      }
    }
  }
  
  /**
   * Aktifkan/nonaktifkan WAF
   * @param {boolean} enable - Status WAF
   */
  setEnabled(enable) {
    this.isEnabled = enable;
    console.log(`WAF ${enable ? 'enabled' : 'disabled'}`);
  }
  
  /**
   * Aktifkan/nonaktifkan aturan WAF tertentu
   * @param {string} rule - Nama aturan
   * @param {boolean} enable - Status aturan
   */
  setRuleEnabled(rule, enable) {
    if (this.activeRules.hasOwnProperty(rule)) {
      this.activeRules[rule] = enable;
      console.log(`WAF rule '${rule}' ${enable ? 'enabled' : 'disabled'}`);
    }
  }
  
  /**
   * Update allowed countries
   * @param {Array<string>} countries - List kode negara
   */
  setAllowedCountries(countries) {
    this.allowedCountries = countries;
    console.log(`Updated allowed countries: ${countries.join(', ')}`);
  }
}

// Buat instance WAF
const wafInstance = new WAF();

/**
 * Middleware WAF untuk Express
 * @param {Object} options - Opsi konfigurasi
 * @returns {Function} Middleware Express
 */
const wafMiddleware = (options = {}) => {
  // Apply options
  if (options.enabled !== undefined) {
    wafInstance.setEnabled(options.enabled);
  }
  
  if (options.rules) {
    for (const [rule, enabled] of Object.entries(options.rules)) {
      wafInstance.setRuleEnabled(rule, enabled);
    }
  }
  
  if (options.allowedCountries) {
    wafInstance.setAllowedCountries(options.allowedCountries);
  }
  
  // Middleware function
  return (req, res, next) => {
    const inspectionResult = wafInstance.inspectRequest(req);
    
    if (inspectionResult.blocked) {
      res.status(403).json({
        success: false,
        message: inspectionResult.reason || 'Permintaan diblokir oleh WAF',
        code: inspectionResult.category || 'WAF_BLOCKED'
      });
      return;
    }
    
    next();
  };
};

/**
 * Dapatkan instance WAF
 * @returns {WAF} Instance WAF
 */
const getWAFInstance = () => wafInstance;

module.exports = {
  wafMiddleware,
  getWAFInstance
}; 