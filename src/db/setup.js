const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const config = require('../config/config');

// Pastikan direktori untuk database ada
const dbDir = path.dirname(config.SQLITE_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Buat koneksi database
const db = new sqlite3.Database(config.SQLITE_PATH, (err) => {
  if (err) {
    console.error('Error connecting to SQLite database:', err.message);
    return;
  }
  console.log('Connected to SQLite database at', config.SQLITE_PATH);
  
  // Aktifkan foreign keys
  db.run('PRAGMA foreign_keys = ON');
  
  // Buat schema database jika belum ada
  createTables();
});

// Fungsi untuk membuat tabel-tabel yang diperlukan
function createTables() {
  // Tabel Users (Orang Tua & Anak)
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      name TEXT,
      email TEXT UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Tabel Children (Perangkat Anak)
  db.run(`
    CREATE TABLE IF NOT EXISTS children (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      device_id TEXT UNIQUE,
      device_model TEXT,
      device_os TEXT,
      last_sync TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);
  
  // Tabel Applications (Aplikasi yang diinstal di perangkat anak)
  db.run(`
    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      child_id INTEGER NOT NULL,
      package_name TEXT NOT NULL,
      app_name TEXT NOT NULL,
      category TEXT,
      is_blocked BOOLEAN DEFAULT 0,
      usage_limit INTEGER DEFAULT 60,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (child_id) REFERENCES children (id) ON DELETE CASCADE,
      UNIQUE(child_id, package_name)
    )
  `);
  
  // Tabel Application Usage (Penggunaan aplikasi oleh anak)
  db.run(`
    CREATE TABLE IF NOT EXISTS app_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      child_id INTEGER NOT NULL,
      package_name TEXT NOT NULL,
      usage_date DATE NOT NULL,
      usage_time INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (child_id) REFERENCES children (id) ON DELETE CASCADE
    )
  `);
  
  // Tabel Screen Time (Pengaturan waktu layar)
  db.run(`
    CREATE TABLE IF NOT EXISTS screen_time (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      child_id INTEGER NOT NULL,
      day_of_week INTEGER NOT NULL,
      start_time TEXT,
      end_time TEXT,
      max_usage INTEGER DEFAULT 120,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (child_id) REFERENCES children (id) ON DELETE CASCADE,
      UNIQUE(child_id, day_of_week)
    )
  `);
  
  // Tabel Safe Zones (Zona aman anak)
  db.run(`
    CREATE TABLE IF NOT EXISTS safe_zones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      child_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      radius INTEGER DEFAULT 500,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (child_id) REFERENCES children (id) ON DELETE CASCADE
    )
  `);
  
  // Tabel Location History (Riwayat lokasi anak)
  db.run(`
    CREATE TABLE IF NOT EXISTS location_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      child_id INTEGER NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      accuracy REAL,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (child_id) REFERENCES children (id) ON DELETE CASCADE
    )
  `);
  
  // Tabel Content Filtering (Aturan filter konten)
  db.run(`
    CREATE TABLE IF NOT EXISTS content_filters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      child_id INTEGER NOT NULL,
      filter_type TEXT NOT NULL,
      is_enabled BOOLEAN DEFAULT 1,
      sensitivity INTEGER DEFAULT 85,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (child_id) REFERENCES children (id) ON DELETE CASCADE
    )
  `);
  
  // Tabel Notifications (Notifikasi untuk orang tua)
  db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT,
      is_read BOOLEAN DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);
  
  console.log('Database schema initialized');
}

// Fungsi untuk menutup koneksi database
function closeDatabase() {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message);
        reject(err);
      } else {
        console.log('Database connection closed');
        resolve();
      }
    });
  });
}

// Export koneksi database dan fungsi-fungsi
module.exports = {
  db,
  close: closeDatabase
}; 