const crypto = require('crypto');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const { config } = require('../config/environment');
const { securityLogger } = require('../utils/logger');

/**
 * Kelas untuk implementasi 2FA (Two-Factor Authentication)
 * Mendukung TOTP (Time-based One-Time Password) melalui aplikasi
 * seperti Google Authenticator, Authy, dll.
 */
class TwoFactorAuth {
  constructor(dbClient) {
    this.db = dbClient;
    this.secretEncryptionKey = config.secretEncryptionKey || crypto.randomBytes(32).toString('hex');
    this.issuer = 'TRACAS Admin';
    
    // Inisialisasi backup codes dalam memori
    this.backupCodes = new Map();
  }
  
  /**
   * Enkripsi secret key 2FA
   * @param {string} secret - Secret key yang akan dienkripsi
   * @param {string} userId - ID user
   * @returns {string} Secret terenkripsi
   */
  encryptSecret(secret, userId) {
    try {
      const iv = crypto.randomBytes(16);
      const key = crypto.createHash('sha256').update(this.secretEncryptionKey + userId).digest();
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      
      let encrypted = cipher.update(secret, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
      securityLogger.error(`Error encrypting 2FA secret: ${error.message}`, {
        userId,
        error: error.stack
      });
      
      throw new Error('Failed to encrypt 2FA secret');
    }
  }
  
  /**
   * Dekripsi secret key 2FA
   * @param {string} encryptedSecret - Secret key terenkripsi
   * @param {string} userId - ID user
   * @returns {string} Secret terdekripsi
   */
  decryptSecret(encryptedSecret, userId) {
    try {
      const parts = encryptedSecret.split(':');
      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      const key = crypto.createHash('sha256').update(this.secretEncryptionKey + userId).digest();
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      securityLogger.error(`Error decrypting 2FA secret: ${error.message}`, {
        userId,
        error: error.stack
      });
      
      throw new Error('Failed to decrypt 2FA secret');
    }
  }
  
  /**
   * Generate secret key baru untuk 2FA
   * @param {Object} user - User data
   * @returns {Object} Setup data untuk 2FA
   */
  async generateSecret(user) {
    try {
      // Buat secret baru
      const secret = speakeasy.generateSecret({
        length: 20,
        name: `${this.issuer}:${user.email || user.username}`,
        issuer: this.issuer
      });
      
      // Buat QR code untuk secret
      const otpAuthUrl = secret.otpauth_url;
      const qrCodeDataUrl = await qrcode.toDataURL(otpAuthUrl);
      
      // Simpan secret untuk user
      const encryptedSecret = this.encryptSecret(secret.base32, user.id);
      
      // Generate backup codes
      const backupCodes = this.generateBackupCodes(user.id);
      
      // Logging
      securityLogger.logAdmin('2FA Setup Initiated', user.username, {
        userId: user.id
      });
      
      return {
        secret: secret.base32,
        qrCode: qrCodeDataUrl,
        encryptedSecret,
        backupCodes
      };
    } catch (error) {
      securityLogger.error(`Error generating 2FA secret: ${error.message}`, {
        userId: user.id,
        error: error.stack
      });
      
      throw new Error('Failed to generate 2FA secret');
    }
  }
  
  /**
   * Verifikasi TOTP (Time-based One-Time Password)
   * @param {string} token - Token dari aplikasi authenticator
   * @param {string} encryptedSecret - Secret key terenkripsi
   * @param {string} userId - ID user
   * @returns {boolean} Apakah token valid
   */
  verifyToken(token, encryptedSecret, userId) {
    try {
      // Dekripsi secret
      const secret = this.decryptSecret(encryptedSecret, userId);
      
      // Verifikasi token
      const verified = speakeasy.totp.verify({
        secret: secret,
        encoding: 'base32',
        token: token,
        window: 1 // Toleransi ±30 detik
      });
      
      // Logging
      securityLogger.logAuth(verified, '2FA Verification', {
        userId,
        method: 'TOTP'
      });
      
      return verified;
    } catch (error) {
      securityLogger.error(`Error verifying 2FA token: ${error.message}`, {
        userId,
        error: error.stack
      });
      
      return false;
    }
  }
  
  /**
   * Generate backup codes untuk recovery
   * @param {string} userId - ID user
   * @param {number} count - Jumlah backup code yang dibuat
   * @returns {Array<string>} Backup codes
   */
  generateBackupCodes(userId, count = 10) {
    try {
      const codes = [];
      const hashes = [];
      
      // Generate backup codes unik
      for (let i = 0; i < count; i++) {
        // Format: xxxx-xxxx-xxxx (12 karakter)
        let code = '';
        for (let j = 0; j < 3; j++) {
          code += crypto.randomBytes(2).toString('hex') + (j < 2 ? '-' : '');
        }
        
        codes.push(code);
        
        // Hash code untuk penyimpanan aman
        const hash = crypto.createHash('sha256').update(code + userId).digest('hex');
        hashes.push(hash);
      }
      
      // Simpan hash codes ke memori (dalam implementasi asli: ke database)
      this.backupCodes.set(userId, hashes);
      
      // Logging
      securityLogger.logAdmin('2FA Backup Codes Generated', null, {
        userId,
        count
      });
      
      return codes;
    } catch (error) {
      securityLogger.error(`Error generating backup codes: ${error.message}`, {
        userId,
        error: error.stack
      });
      
      throw new Error('Failed to generate backup codes');
    }
  }
  
  /**
   * Verifikasi backup code
   * @param {string} code - Backup code dari user
   * @param {string} userId - ID user
   * @returns {boolean} Apakah code valid
   */
  verifyBackupCode(code, userId) {
    try {
      // Ambil backup codes dari memori (implementasi asli: dari database)
      const storedHashes = this.backupCodes.get(userId);
      
      if (!storedHashes || !storedHashes.length) {
        return false;
      }
      
      // Hash code yang diinput
      const inputHash = crypto.createHash('sha256').update(code + userId).digest('hex');
      
      // Cek apakah hash cocok dengan salah satu stored hash
      const index = storedHashes.indexOf(inputHash);
      if (index !== -1) {
        // Hapus code yang sudah digunakan
        storedHashes.splice(index, 1);
        this.backupCodes.set(userId, storedHashes);
        
        // Logging
        securityLogger.logAuth(true, '2FA Backup Code Verification', {
          userId,
          method: 'BackupCode'
        });
        
        return true;
      }
      
      // Logging gagal
      securityLogger.logAuth(false, '2FA Backup Code Verification Failed', {
        userId,
        method: 'BackupCode'
      });
      
      return false;
    } catch (error) {
      securityLogger.error(`Error verifying backup code: ${error.message}`, {
        userId,
        error: error.stack
      });
      
      return false;
    }
  }
  
  /**
   * Disable 2FA untuk user tertentu
   * @param {string} userId - ID user
   * @returns {boolean} Apakah berhasil
   */
  disableTwoFactor(userId) {
    try {
      // Hapus backup codes
      this.backupCodes.delete(userId);
      
      // Logging
      securityLogger.logAdmin('2FA Disabled', null, {
        userId
      });
      
      return true;
    } catch (error) {
      securityLogger.error(`Error disabling 2FA: ${error.message}`, {
        userId,
        error: error.stack
      });
      
      return false;
    }
  }
}

// Singleton instance
let twoFactorAuthInstance = null;

/**
 * Inisialisasi Two Factor Authentication
 * @param {Object} dbClient - Database client
 * @returns {TwoFactorAuth} Instance TwoFactorAuth
 */
const initTwoFactorAuth = (dbClient) => {
  if (!twoFactorAuthInstance) {
    twoFactorAuthInstance = new TwoFactorAuth(dbClient);
  }
  return twoFactorAuthInstance;
};

/**
 * Middleware untuk memeriksa apakah 2FA wajib untuk request
 * @param {Object} options - Opsi konfigurasi
 * @returns {Function} Middleware Express
 */
const requireTwoFactor = (options = {}) => {
  return async (req, res, next) => {
    // Periksa hanya untuk admin
    if (req.user && req.user.role === 'admin') {
      // Periksa apakah user memiliki 2FA aktif
      const has2FAEnabled = true; // Placeholder, ideally check from DB
      
      if (has2FAEnabled) {
        // Periksa apakah request sudah terverifikasi 2FA
        const session2FAVerified = req.session && req.session.twoFactorVerified;
        
        if (!session2FAVerified) {
          return res.status(403).json({
            success: false,
            message: 'Two-factor authentication required',
            requireTwoFactor: true
          });
        }
      }
    }
    
    next();
  };
};

module.exports = {
  TwoFactorAuth,
  initTwoFactorAuth,
  requireTwoFactor
}; 