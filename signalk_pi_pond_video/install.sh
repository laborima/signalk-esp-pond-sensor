#!/bin/bash
#
# Installation script for SignalK Pi Pond Video
# Run on Raspberry Pi Zero WH with Camera Module v3
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="/opt/signalk_pi_pond_video"
SERVICE_NAME="signalk-pi-pond-video"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo "SignalK Pi Pond Video - Installation"
echo "========================================"
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo -e "${RED}Error: Do not run this script as root${NC}"
    echo "The script will use sudo when needed"
    exit 1
fi

# Check Raspberry Pi model
echo "Checking hardware..."
if [ -f /proc/device-tree/model ]; then
    MODEL=$(tr -d '\0' < /proc/device-tree/model)
    echo "  Device: $MODEL"
else
    echo "  Warning: Cannot determine device model"
fi

# Check for camera
echo ""
echo "Checking camera module..."
if ! libcamera-hello --list-cameras 2>/dev/null | grep -q "Available"; then
    echo -e "${YELLOW}Warning: No camera detected${NC}"
    echo "Please ensure Camera Module v3 is properly connected"
    echo "and enabled via 'sudo raspi-config' -> Interface Options -> Camera"
else
    echo -e "${GREEN}  Camera detected${NC}"
fi

# Update system
echo ""
echo "Updating package lists..."
sudo apt update

# Install dependencies
echo ""
echo "Installing dependencies..."
sudo apt install -y \
    python3-pip \
    python3-picamera2 \
    python3-flask \
    python3-yaml \
    python3-pil \
    libcamera-dev

# Install Python packages via pip for newer versions
echo ""
echo "Installing Python packages..."
pip3 install --user --break-system-packages \
    flask-socketio \
    python-socketio \
    eventlet 2>/dev/null || \
pip3 install --user \
    flask-socketio \
    python-socketio \
    eventlet

# Create installation directory
echo ""
echo "Creating installation directory..."
sudo mkdir -p "$INSTALL_DIR"
sudo chown pi:pi "$INSTALL_DIR"

# Copy files
echo ""
echo "Copying application files..."
cp -v "$SCRIPT_DIR/main.py" "$INSTALL_DIR/"
cp -v "$SCRIPT_DIR/camera_manager.py" "$INSTALL_DIR/"
cp -v "$SCRIPT_DIR/config.yaml" "$INSTALL_DIR/"

# Set permissions
echo ""
echo "Setting permissions..."
chmod +x "$INSTALL_DIR/main.py"
chmod +x "$INSTALL_DIR/camera_manager.py"

# Add user to video group
echo ""
echo "Adding user to video group..."
sudo usermod -a -G video pi

# Create log directory
echo ""
echo "Creating log directory..."
sudo mkdir -p /var/log
sudo touch /var/log/signalk_pi_pond_video.log
sudo chown pi:pi /var/log/signalk_pi_pond_video.log

# Install systemd service
echo ""
echo "Installing systemd service..."
sudo cp -v "$SCRIPT_DIR/signalk-pi-pond-video.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"

# Create log rotation config
echo ""
echo "Setting up log rotation..."
sudo tee /etc/logrotate.d/signalk-pi-pond-video > /dev/null << 'EOF'
/var/log/signalk_pi_pond_video.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 644 pi pi
}
EOF

echo ""
echo "========================================"
echo -e "${GREEN}Installation complete!${NC}"
echo "========================================"
echo ""
echo "Next steps:"
echo "  1. Edit configuration:"
echo "     sudo nano $INSTALL_DIR/config.yaml"
echo ""
echo "  2. Start the service:"
echo "     sudo systemctl start $SERVICE_NAME"
echo ""
echo "  3. Check status:"
echo "     sudo systemctl status $SERVICE_NAME"
echo ""
echo "  4. View logs:"
echo "     sudo journalctl -u $SERVICE_NAME -f"
echo ""
echo "  5. Test the camera:"
echo "     curl http://$(hostname -I | awk '{print $1}'):8080/"
echo ""
echo "  Note: You may need to log out and back in for"
echo "        group membership (video) to take effect."
echo ""
