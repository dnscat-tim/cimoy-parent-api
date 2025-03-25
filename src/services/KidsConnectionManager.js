/**
 * Service untuk mengelola koneksi dengan CIMOY Kids
 * Layanan ini menangani:
 * 1. Koneksi WebSocket ke CIMOY Kids
 * 2. Manajemen perintah dan respon
 * 3. Pemantauan status koneksi
 */

import { io } from 'socket.io-client';
import { Preferences } from '@capacitor/preferences';
import { Device } from '@capacitor/device';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import CryptoJS from 'crypto-js';

// Konfigurasi
const CONFIG = {
  RECONNECT_DELAY: 5000,
  PING_INTERVAL: 30000,
  CONNECTION_TIMEOUT: 15000,
  AUTH_KEY: 'c1m0y-s3cur3-k3y-c0nn3ct10n',
  STORAGE_KEY: 'cimoy_kids_devices'
};

class KidsConnectionManager {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.devices = [];
    this.connectionListeners = [];
    this.commandListeners = {};
    this.pendingCommands = {};
    this.deviceId = null;
    
    // Inisialisasi
    this.init();
  }
  
  /**
   * Inisialisasi manager
   */
  async init() {
    try {
      // Dapatkan device ID
      const info = await Device.getInfo();
      this.deviceId = info.uuid;
      
      // Muat daftar perangkat dari storage
      await this.loadDevices();
      
      console.log('✅ KidsConnectionManager berhasil diinisialisasi');
    } catch (error) {
      console.error('❌ Gagal inisialisasi KidsConnectionManager:', error);
    }
  }
  
  /**
   * Muat daftar perangkat anak dari storage
   */
  async loadDevices() {
    try {
      const { value } = await Preferences.get({ key: CONFIG.STORAGE_KEY });
      
      if (value) {
        this.devices = JSON.parse(value);
      }
    } catch (error) {
      console.error('❌ Gagal memuat daftar perangkat:', error);
      this.devices = [];
    }
  }
  
  /**
   * Simpan daftar perangkat anak ke storage
   */
  async saveDevices() {
    try {
      await Preferences.set({
        key: CONFIG.STORAGE_KEY,
        value: JSON.stringify(this.devices)
      });
    } catch (error) {
      console.error('❌ Gagal menyimpan daftar perangkat:', error);
    }
  }
  
  /**
   * Tambah perangkat anak baru
   * @param {Object} device - Informasi perangkat anak
   */
  async addDevice(device) {
    // Pastikan device memiliki properti yang diperlukan
    if (!device.id || !device.name || !device.address) {
      throw new Error('Data perangkat tidak lengkap');
    }
    
    // Cek apakah perangkat sudah ada
    const existingIndex = this.devices.findIndex(d => d.id === device.id);
    
    if (existingIndex >= 0) {
      // Update perangkat yang sudah ada
      this.devices[existingIndex] = {
        ...this.devices[existingIndex],
        ...device,
        lastUpdate: new Date().toISOString()
      };
    } else {
      // Tambah perangkat baru
      this.devices.push({
        ...device,
        isConnected: false,
        lastConnected: null,
        lastUpdate: new Date().toISOString()
      });
    }
    
    // Simpan perubahan
    await this.saveDevices();
    
    return true;
  }
  
  /**
   * Hapus perangkat anak
   * @param {string} deviceId - ID perangkat yang akan dihapus
   */
  async removeDevice(deviceId) {
    const initialLength = this.devices.length;
    this.devices = this.devices.filter(d => d.id !== deviceId);
    
    // Jika ada perubahan, simpan
    if (initialLength !== this.devices.length) {
      await this.saveDevices();
      return true;
    }
    
    return false;
  }
  
  /**
   * Dapatkan daftar perangkat anak
   */
  getDevices() {
    return [...this.devices];
  }
  
  /**
   * Dapatkan detail perangkat anak berdasarkan ID
   * @param {string} deviceId - ID perangkat
   */
  getDevice(deviceId) {
    return this.devices.find(d => d.id === deviceId) || null;
  }
  
  /**
   * Hubungkan ke perangkat anak
   * @param {string} deviceId - ID perangkat anak
   * @param {string} address - Alamat perangkat anak (IP atau URL)
   */
  async connect(deviceId, address) {
    // Cek apakah perangkat ada dalam daftar
    const device = this.getDevice(deviceId);
    
    if (!device) {
      throw new Error('Perangkat tidak ditemukan');
    }
    
    // Tutup koneksi yang ada jika sudah terhubung
    if (this.socket && this.socket.connected) {
      this.disconnect();
    }
    
    // Bersihkan timer
    clearTimeout(this.reconnectTimer);
    clearInterval(this.pingTimer);
    
    try {
      // Buat koneksi Socket.IO baru
      const socketAddress = address.startsWith('http') ? address : `http://${address}:9876`;
      
      // Buat token otentikasi
      const timestamp = new Date().getTime();
      const authToken = this.generateAuthToken(deviceId, timestamp);
      
      this.socket = io(socketAddress, {
        reconnection: false,
        timeout: CONFIG.CONNECTION_TIMEOUT,
        auth: {
          deviceId: this.deviceId,
          token: authToken,
          timestamp
        }
      });
      
      // Setup event listeners
      this.setupSocketListeners(deviceId);
      
      // Notifikasi
      if (Capacitor.isNativePlatform()) {
        await LocalNotifications.schedule({
          notifications: [{
            title: 'CIMOY Parent',
            body: `Menghubungkan ke ${device.name}...`,
            id: 20
          }]
        });
      }
      
      // Update status perangkat
      const deviceIndex = this.devices.findIndex(d => d.id === deviceId);
      if (deviceIndex >= 0) {
        this.devices[deviceIndex].isConnecting = true;
        this.devices[deviceIndex].lastConnectionAttempt = new Date().toISOString();
        await this.saveDevices();
      }
      
      return true;
    } catch (error) {
      console.error(`❌ Gagal terhubung ke perangkat ${deviceId}:`, error);
      
      // Jadwalkan reconnect
      this.scheduleReconnect(deviceId, address);
      
      return false;
    }
  }
  
  /**
   * Setup event listeners untuk Socket.IO
   * @param {string} deviceId - ID perangkat yang sedang terhubung
   */
  setupSocketListeners(deviceId) {
    if (!this.socket) return;
    
    // Event saat berhasil terhubung
    this.socket.on('connect', async () => {
      this.isConnected = true;
      
      // Update status perangkat
      const deviceIndex = this.devices.findIndex(d => d.id === deviceId);
      if (deviceIndex >= 0) {
        this.devices[deviceIndex].isConnected = true;
        this.devices[deviceIndex].isConnecting = false;
        this.devices[deviceIndex].lastConnected = new Date().toISOString();
        this.devices[deviceIndex].lastUpdate = new Date().toISOString();
        await this.saveDevices();
      }
      
      // Beri tahu listeners
      this.notifyConnectionListeners({
        status: 'connected',
        deviceId
      });
      
      // Mulai ping interval
      this.startPingInterval(deviceId);
      
      // Notifikasi
      if (Capacitor.isNativePlatform()) {
        await LocalNotifications.schedule({
          notifications: [{
            title: 'CIMOY Parent',
            body: `Terhubung ke ${this.devices[deviceIndex]?.name || 'perangkat'}`,
            id: 21
          }]
        });
      }
      
      console.log(`✅ Berhasil terhubung ke perangkat ${deviceId}`);
    });
    
    // Event saat koneksi terputus
    this.socket.on('disconnect', async (reason) => {
      this.isConnected = false;
      
      // Update status perangkat
      const deviceIndex = this.devices.findIndex(d => d.id === deviceId);
      if (deviceIndex >= 0) {
        this.devices[deviceIndex].isConnected = false;
        this.devices[deviceIndex].isConnecting = false;
        this.devices[deviceIndex].lastUpdate = new Date().toISOString();
        await this.saveDevices();
      }
      
      // Beri tahu listeners
      this.notifyConnectionListeners({
        status: 'disconnected',
        deviceId,
        reason
      });
      
      // Bersihkan ping interval
      clearInterval(this.pingTimer);
      
      // Jadwalkan reconnect
      this.scheduleReconnect(deviceId, this.devices[deviceIndex]?.address);
      
      // Notifikasi
      if (Capacitor.isNativePlatform()) {
        await LocalNotifications.schedule({
          notifications: [{
            title: 'CIMOY Parent',
            body: `Koneksi ke ${this.devices[deviceIndex]?.name || 'perangkat'} terputus`,
            id: 22
          }]
        });
      }
      
      console.log(`⚠️ Terputus dari perangkat ${deviceId}. Alasan: ${reason}`);
    });
    
    // Event saat terjadi error
    this.socket.on('connect_error', async (error) => {
      console.error(`❌ Gagal terhubung ke perangkat ${deviceId}:`, error.message);
      
      // Update status perangkat
      const deviceIndex = this.devices.findIndex(d => d.id === deviceId);
      if (deviceIndex >= 0) {
        this.devices[deviceIndex].isConnected = false;
        this.devices[deviceIndex].isConnecting = false;
        this.devices[deviceIndex].lastConnectionError = error.message;
        this.devices[deviceIndex].lastUpdate = new Date().toISOString();
        await this.saveDevices();
      }
      
      // Beri tahu listeners
      this.notifyConnectionListeners({
        status: 'error',
        deviceId,
        error: error.message
      });
      
      // Jadwalkan reconnect
      this.scheduleReconnect(deviceId, this.devices[deviceIndex]?.address);
    });
    
    // Event saat menerima pesan
    this.socket.on('message', async (data) => {
      try {
        // Verifikasi dan dekripsi data
        const decryptedData = this.decryptMessage(data);
        
        // Proses data yang diterima
        await this.processIncomingMessage(deviceId, decryptedData);
      } catch (error) {
        console.error('❌ Gagal memproses pesan yang diterima:', error);
      }
    });
    
    // Event saat menerima status
    this.socket.on('status', async (data) => {
      try {
        // Update status perangkat
        const deviceIndex = this.devices.findIndex(d => d.id === deviceId);
        if (deviceIndex >= 0) {
          // Update status yang diterima
          this.devices[deviceIndex] = {
            ...this.devices[deviceIndex],
            ...data,
            lastUpdate: new Date().toISOString()
          };
          await this.saveDevices();
        }
        
        // Beri tahu listeners
        this.notifyConnectionListeners({
          status: 'status_update',
          deviceId,
          data
        });
      } catch (error) {
        console.error('❌ Gagal memproses status:', error);
      }
    });
    
    // Event saat menerima respons untuk perintah
    this.socket.on('command_response', async (data) => {
      try {
        // Verifikasi dan dekripsi data
        const decryptedData = this.decryptMessage(data);
        
        // Proses respons
        await this.processCommandResponse(deviceId, decryptedData);
      } catch (error) {
        console.error('❌ Gagal memproses respons perintah:', error);
      }
    });
  }
  
  /**
   * Mulai interval ping untuk menjaga koneksi tetap aktif
   * @param {string} deviceId - ID perangkat yang sedang terhubung
   */
  startPingInterval(deviceId) {
    clearInterval(this.pingTimer);
    
    this.pingTimer = setInterval(() => {
      if (!this.socket || !this.socket.connected) {
        clearInterval(this.pingTimer);
        return;
      }
      
      // Kirim ping ke perangkat
      this.socket.emit('ping', {
        timestamp: new Date().getTime(),
        deviceId: this.deviceId
      });
    }, CONFIG.PING_INTERVAL);
  }
  
  /**
   * Jadwalkan koneksi ulang
   * @param {string} deviceId - ID perangkat
   * @param {string} address - Alamat perangkat
   */
  scheduleReconnect(deviceId, address) {
    clearTimeout(this.reconnectTimer);
    
    // Cek apakah address valid
    if (!address) return;
    
    this.reconnectTimer = setTimeout(() => {
      console.log(`🔄 Mencoba menghubungkan ulang ke perangkat ${deviceId}...`);
      this.connect(deviceId, address);
    }, CONFIG.RECONNECT_DELAY);
  }
  
  /**
   * Putuskan koneksi yang sedang aktif
   */
  disconnect() {
    if (!this.socket) return;
    
    clearInterval(this.pingTimer);
    clearTimeout(this.reconnectTimer);
    
    try {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    } catch (error) {
      console.error('❌ Gagal memutuskan koneksi:', error);
    }
  }
  
  /**
   * Tambahkan listener untuk perubahan status koneksi
   * @param {Function} listener - Callback function
   */
  addConnectionListener(listener) {
    if (typeof listener === 'function' && !this.connectionListeners.includes(listener)) {
      this.connectionListeners.push(listener);
    }
  }
  
  /**
   * Hapus listener koneksi
   * @param {Function} listener - Callback function
   */
  removeConnectionListener(listener) {
    this.connectionListeners = this.connectionListeners.filter(l => l !== listener);
  }
  
  /**
   * Notifikasi semua listener tentang perubahan status koneksi
   * @param {Object} event - Event data
   */
  notifyConnectionListeners(event) {
    this.connectionListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('❌ Error pada connection listener:', error);
      }
    });
  }
  
  /**
   * Tambahkan listener untuk jenis perintah tertentu
   * @param {string} commandType - Jenis perintah
   * @param {Function} listener - Callback function
   */
  addCommandListener(commandType, listener) {
    if (typeof listener !== 'function') return;
    
    if (!this.commandListeners[commandType]) {
      this.commandListeners[commandType] = [];
    }
    
    if (!this.commandListeners[commandType].includes(listener)) {
      this.commandListeners[commandType].push(listener);
    }
  }
  
  /**
   * Hapus listener perintah
   * @param {string} commandType - Jenis perintah
   * @param {Function} listener - Callback function
   */
  removeCommandListener(commandType, listener) {
    if (!this.commandListeners[commandType]) return;
    
    this.commandListeners[commandType] = this.commandListeners[commandType].filter(l => l !== listener);
  }
  
  /**
   * Notifikasi listener untuk jenis perintah tertentu
   * @param {string} commandType - Jenis perintah
   * @param {Object} data - Data perintah
   */
  notifyCommandListeners(commandType, data) {
    if (!this.commandListeners[commandType]) return;
    
    this.commandListeners[commandType].forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        console.error(`❌ Error pada command listener (${commandType}):`, error);
      }
    });
  }
  
  /**
   * Proses pesan masuk dari perangkat
   * @param {string} deviceId - ID perangkat
   * @param {Object} message - Pesan yang diterima
   */
  async processIncomingMessage(deviceId, message) {
    // Validasi format pesan
    if (!message || !message.type) {
      console.error('❌ Format pesan tidak valid:', message);
      return;
    }
    
    // Proses berdasarkan jenis pesan
    switch (message.type) {
      case 'location_update':
        // Update lokasi perangkat
        const deviceIndex = this.devices.findIndex(d => d.id === deviceId);
        if (deviceIndex >= 0) {
          this.devices[deviceIndex].location = message.data;
          this.devices[deviceIndex].lastUpdate = new Date().toISOString();
          await this.saveDevices();
        }
        
        // Notifikasi listeners
        this.notifyCommandListeners('location_update', {
          deviceId,
          location: message.data
        });
        break;
        
      case 'app_usage':
        // Notifikasi listeners
        this.notifyCommandListeners('app_usage', {
          deviceId,
          usage: message.data
        });
        break;
        
      case 'alert':
        // Tampilkan notifikasi
        if (Capacitor.isNativePlatform()) {
          await LocalNotifications.schedule({
            notifications: [{
              title: 'CIMOY Alert',
              body: message.data.message,
              id: 30 + Math.floor(Math.random() * 100)
            }]
          });
        }
        
        // Notifikasi listeners
        this.notifyCommandListeners('alert', {
          deviceId,
          alert: message.data
        });
        break;
        
      default:
        // Notifikasi listeners untuk jenis pesan yang tidak diketahui
        this.notifyCommandListeners(message.type, {
          deviceId,
          data: message.data
        });
    }
  }
  
  /**
   * Proses respons perintah dari perangkat
   * @param {string} deviceId - ID perangkat
   * @param {Object} response - Respons yang diterima
   */
  async processCommandResponse(deviceId, response) {
    // Validasi format respons
    if (!response || !response.commandId) {
      console.error('❌ Format respons tidak valid:', response);
      return;
    }
    
    // Cek apakah ada perintah yang tertunda
    const pendingCommand = this.pendingCommands[response.commandId];
    
    if (pendingCommand) {
      // Selesaikan perintah
      if (pendingCommand.resolve) {
        pendingCommand.resolve(response);
      }
      
      // Hapus dari daftar tertunda
      delete this.pendingCommands[response.commandId];
    }
    
    // Notifikasi listeners berdasarkan tipe perintah
    if (response.commandType) {
      this.notifyCommandListeners(`${response.commandType}_response`, {
        deviceId,
        response
      });
    }
  }
  
  /**
   * Kirim perintah ke perangkat anak
   * @param {string} deviceId - ID perangkat
   * @param {string} commandType - Jenis perintah
   * @param {Object} data - Data perintah
   * @param {number} timeout - Batas waktu tunggu respons (ms)
   */
  async sendCommand(deviceId, commandType, data = {}, timeout = 30000) {
    if (!this.socket || !this.socket.connected) {
      throw new Error('Tidak terhubung ke perangkat');
    }
    
    // Buat ID perintah unik
    const commandId = this.generateCommandId();
    
    // Buat objek perintah
    const command = {
      id: commandId,
      type: commandType,
      data,
      timestamp: new Date().getTime(),
      sender: this.deviceId
    };
    
    // Enkripsi perintah
    const encryptedCommand = this.encryptMessage(command);
    
    // Buat Promise untuk menunggu respons
    return new Promise((resolve, reject) => {
      // Simpan perintah ke daftar tertunda
      this.pendingCommands[commandId] = {
        command,
        resolve,
        reject,
        timestamp: new Date().getTime()
      };
      
      // Set timer untuk batas waktu
      const timeoutId = setTimeout(() => {
        // Hapus dari daftar tertunda
        delete this.pendingCommands[commandId];
        
        // Tolak Promise dengan error timeout
        reject(new Error(`Timeout menunggu respons untuk perintah ${commandType}`));
      }, timeout);
      
      // Kirim perintah
      this.socket.emit('command', encryptedCommand, (ack) => {
        if (ack && ack.error) {
          // Batalkan timer timeout
          clearTimeout(timeoutId);
          
          // Hapus dari daftar tertunda
          delete this.pendingCommands[commandId];
          
          // Tolak Promise dengan error dari server
          reject(new Error(ack.error));
        }
      });
    });
  }
  
  /**
   * Generate token otentikasi untuk koneksi
   * @param {string} deviceId - ID perangkat anak
   * @param {number} timestamp - Timestamp saat ini
   */
  generateAuthToken(deviceId, timestamp) {
    const data = `${deviceId}:${this.deviceId}:${timestamp}:${CONFIG.AUTH_KEY}`;
    return CryptoJS.SHA256(data).toString();
  }
  
  /**
   * Generate ID perintah unik
   */
  generateCommandId() {
    return `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Enkripsi pesan
   * @param {Object} message - Pesan yang akan dienkripsi
   */
  encryptMessage(message) {
    const messageString = JSON.stringify(message);
    const encrypted = CryptoJS.AES.encrypt(messageString, CONFIG.AUTH_KEY).toString();
    
    return {
      data: encrypted,
      id: message.id,
      timestamp: message.timestamp
    };
  }
  
  /**
   * Dekripsi pesan
   * @param {Object} encryptedMessage - Pesan terenkripsi
   */
  decryptMessage(encryptedMessage) {
    if (!encryptedMessage || !encryptedMessage.data) {
      throw new Error('Format pesan terenkripsi tidak valid');
    }
    
    const decrypted = CryptoJS.AES.decrypt(encryptedMessage.data, CONFIG.AUTH_KEY).toString(CryptoJS.enc.Utf8);
    
    return JSON.parse(decrypted);
  }
}

// Singleton instance
const kidsConnectionManager = new KidsConnectionManager();
export default kidsConnectionManager; 