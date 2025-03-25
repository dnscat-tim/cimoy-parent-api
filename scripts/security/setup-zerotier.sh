#!/bin/bash

# Script untuk instalasi dan konfigurasi ZeroTier untuk TRACAS Server
# Harus dijalankan dengan sudo
# Penggunaan: sudo bash setup-zerotier.sh <network_id>

# Cek apakah dijalankan sebagai root
if [ "$EUID" -ne 0 ]; then
  echo "Script harus dijalankan dengan sudo"
  exit 1
fi

# Cek apakah network ID disediakan
if [ -z "$1" ]; then
  echo "Network ID ZeroTier harus disediakan"
  echo "Penggunaan: sudo bash setup-zerotier.sh <network_id>"
  exit 1
fi

NETWORK_ID=$1

# Instal ZeroTier
echo "Menginstal ZeroTier..."
curl -s https://install.zerotier.com | bash

# Aktifkan layanan
echo "Mengaktifkan layanan ZeroTier..."
systemctl enable zerotier-one
systemctl start zerotier-one

# Tunggu beberapa detik agar layanan berjalan
sleep 5

# Bergabung ke jaringan
echo "Bergabung ke jaringan ZeroTier $NETWORK_ID..."
zerotier-cli join $NETWORK_ID

# Penjelasan penggunaan
echo ""
echo "ZeroTier sudah diinstal dan bergabung ke jaringan $NETWORK_ID"
echo "PENTING: Anda perlu mengotorisasi node ini di Central ZeroTier!"
echo ""
echo "Node ID ZeroTier Anda: $(zerotier-cli info | awk '{print $3}')"
echo ""
echo "Akses ke Central ZeroTier: https://my.zerotier.com/network/$NETWORK_ID"
echo "Untuk melihat status koneksi: zerotier-cli listnetworks"
echo ""

# Setup subnet untuk sistem TRACAS
echo "Membuat konfigurasi network namespace untuk isolasi jaringan..."

# Membuat namespace untuk database
ip netns add tracas_db
ip link add veth_db_host type veth peer name veth_db_ns
ip link set veth_db_ns netns tracas_db
ip addr add 10.0.1.1/24 dev veth_db_host
ip netns exec tracas_db ip addr add 10.0.1.2/24 dev veth_db_ns
ip link set veth_db_host up
ip netns exec tracas_db ip link set veth_db_ns up
ip netns exec tracas_db ip route add default via 10.0.1.1

# Membuat namespace untuk API
ip netns add tracas_api
ip link add veth_api_host type veth peer name veth_api_ns
ip link set veth_api_ns netns tracas_api
ip addr add 10.0.2.1/24 dev veth_api_host
ip netns exec tracas_api ip addr add 10.0.2.2/24 dev veth_api_ns
ip link set veth_api_host up
ip netns exec tracas_api ip link set veth_api_ns up
ip netns exec tracas_api ip route add default via 10.0.2.1

# Membuat namespace untuk monitoring
ip netns add tracas_monitoring
ip link add veth_mon_host type veth peer name veth_mon_ns
ip link set veth_mon_ns netns tracas_monitoring
ip addr add 10.0.3.1/24 dev veth_mon_host
ip netns exec tracas_monitoring ip addr add 10.0.3.2/24 dev veth_mon_ns
ip link set veth_mon_host up
ip netns exec tracas_monitoring ip link set veth_mon_ns up
ip netns exec tracas_monitoring ip route add default via 10.0.3.1

# Aktifkan NAT untuk subnet internal
iptables -t nat -A POSTROUTING -s 10.0.1.0/24 -j MASQUERADE
iptables -t nat -A POSTROUTING -s 10.0.2.0/24 -j MASQUERADE
iptables -t nat -A POSTROUTING -s 10.0.3.0/24 -j MASQUERADE

# Buat file untuk mempertahankan konfigurasi network namespace setelah reboot
cat > /etc/network/if-up.d/zerotier-namespaces << 'EOF'
#!/bin/bash
# Script untuk mengembalikan namespace jaringan setelah reboot

# Database namespace
ip netns add tracas_db 2>/dev/null || true
ip link add veth_db_host type veth peer name veth_db_ns 2>/dev/null || true
ip link set veth_db_ns netns tracas_db 2>/dev/null || true
ip addr add 10.0.1.1/24 dev veth_db_host 2>/dev/null || true
ip netns exec tracas_db ip addr add 10.0.1.2/24 dev veth_db_ns 2>/dev/null || true
ip link set veth_db_host up 2>/dev/null || true
ip netns exec tracas_db ip link set veth_db_ns up 2>/dev/null || true
ip netns exec tracas_db ip route add default via 10.0.1.1 2>/dev/null || true

# API namespace
ip netns add tracas_api 2>/dev/null || true
ip link add veth_api_host type veth peer name veth_api_ns 2>/dev/null || true
ip link set veth_api_ns netns tracas_api 2>/dev/null || true
ip addr add 10.0.2.1/24 dev veth_api_host 2>/dev/null || true
ip netns exec tracas_api ip addr add 10.0.2.2/24 dev veth_api_ns 2>/dev/null || true
ip link set veth_api_host up 2>/dev/null || true
ip netns exec tracas_api ip link set veth_api_ns up 2>/dev/null || true
ip netns exec tracas_api ip route add default via 10.0.2.1 2>/dev/null || true

# Monitoring namespace
ip netns add tracas_monitoring 2>/dev/null || true
ip link add veth_mon_host type veth peer name veth_mon_ns 2>/dev/null || true
ip link set veth_mon_ns netns tracas_monitoring 2>/dev/null || true
ip addr add 10.0.3.1/24 dev veth_mon_host 2>/dev/null || true
ip netns exec tracas_monitoring ip addr add 10.0.3.2/24 dev veth_mon_ns 2>/dev/null || true
ip link set veth_mon_host up 2>/dev/null || true
ip netns exec tracas_monitoring ip link set veth_mon_ns up 2>/dev/null || true
ip netns exec tracas_monitoring ip route add default via 10.0.3.1 2>/dev/null || true

# Aktifkan NAT untuk subnet internal
iptables -t nat -A POSTROUTING -s 10.0.1.0/24 -j MASQUERADE 2>/dev/null || true
iptables -t nat -A POSTROUTING -s 10.0.2.0/24 -j MASQUERADE 2>/dev/null || true
iptables -t nat -A POSTROUTING -s 10.0.3.0/24 -j MASQUERADE 2>/dev/null || true
EOF

chmod +x /etc/network/if-up.d/zerotier-namespaces

echo ""
echo "Konfigurasi subnet selesai dengan struktur:"
echo "- Database: 10.0.1.0/24"
echo "- API: 10.0.2.0/24"
echo "- Monitoring: 10.0.3.0/24"
echo ""
echo "Untuk melihat namespace: ip netns list"
echo "Untuk menjalankan perintah di namespace: ip netns exec <namespace> <perintah>" 