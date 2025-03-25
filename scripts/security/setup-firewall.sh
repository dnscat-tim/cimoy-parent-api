#!/bin/bash

# Script untuk konfigurasi firewall TRACAS Server
# Harus dijalankan dengan sudo
# Penggunaan: sudo bash setup-firewall.sh

# Cek apakah dijalankan sebagai root
if [ "$EUID" -ne 0 ]; then
  echo "Script harus dijalankan dengan sudo"
  exit 1
fi

# Reset iptables
echo "Mereset iptables..."
iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X
iptables -t mangle -F
iptables -t mangle -X

# Kebijakan default: DROP semua koneksi masuk, ACCEPT semua koneksi keluar
echo "Menetapkan kebijakan default..."
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT ACCEPT

# Izinkan localhost
echo "Mengizinkan koneksi localhost..."
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# Izinkan koneksi yang sudah established/related
echo "Mengizinkan koneksi established/related..."
iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# Izinkan ping (opsional, bisa dimatikan di prod)
echo "Mengizinkan ping..."
iptables -A INPUT -p icmp --icmp-type echo-request -j ACCEPT

# Izinkan port untuk API server (3000)
echo "Mengizinkan port 3000 (API)..."
iptables -A INPUT -p tcp --dport 3000 -j ACCEPT

# Izinkan port untuk HTTPS (443) jika menggunakan
echo "Mengizinkan port 443 (HTTPS)..."
iptables -A INPUT -p tcp --dport 443 -j ACCEPT

# Izinkan port untuk HTTP (80) untuk Let's Encrypt
echo "Mengizinkan port 80 (HTTP)..."
iptables -A INPUT -p tcp --dport 80 -j ACCEPT

# Konfigurasi ZeroTier untuk remote access
echo "Mengizinkan ZeroTier (port 9993)..."
iptables -A INPUT -p udp --dport 9993 -j ACCEPT

# Blokir akses langsung ke PostgreSQL
echo "Memblokir akses langsung ke PostgreSQL (port 5432)..."
iptables -A INPUT -p tcp --dport 5432 -j DROP

# Blokir akses SSH dari luar ZeroTier network
echo "Memblokir akses SSH kecuali dari ZeroTier network..."
iptables -A INPUT -p tcp --dport 22 -s 10.0.0.0/8 -j ACCEPT
iptables -A INPUT -p tcp --dport 22 -j DROP

# Rate limiting - 100 requests per minute
echo "Mengaktifkan rate limiting (100 requests/menit)..."
iptables -A INPUT -p tcp --dport 3000 -m limit --limit 100/minute --limit-burst 200 -j ACCEPT
iptables -A INPUT -p tcp --dport 3000 -j DROP

# Simpan aturan iptables agar persisten setelah reboot
echo "Menyimpan konfigurasi iptables..."
if [ -f /etc/debian_version ]; then
  # Untuk Debian/Ubuntu
  apt-get update
  apt-get install -y iptables-persistent
  netfilter-persistent save
elif [ -f /etc/redhat-release ]; then
  # Untuk CentOS/RHEL
  service iptables save
fi

echo "Konfigurasi firewall selesai!"
echo "Untuk melihat aturan yang diterapkan, jalankan: iptables -L"

# Tampilkan aturan yang diterapkan
iptables -L 