#!/bin/bash
#
# Installation script for SignalK Pi Pond Video
# Run on Raspberry Pi Zero WH with Camera Module v3
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="/opt/signalk_pi_pond_video"
SERVICE_NAME="signalk-pi-pond-video"
USER_NAME="$(whoami)"

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
CAMERA_OK=false
# Pi OS 12 (Bookworm): rpicam-hello, Pi OS 11 (Bullseye): libcamera-hello
if rpicam-hello --list-cameras 2>/dev/null | grep -q "Available"; then
    CAMERA_OK=true
elif libcamera-hello --list-cameras 2>/dev/null | grep -q "Available"; then
    CAMERA_OK=true
fi

if [ "$CAMERA_OK" = false ]; then
    echo -e "${YELLOW}Warning: No camera detected${NC}"
    echo "Please ensure Camera Module v3 is properly connected"
    echo "Blue side of ribbon cable faces HDMI port"
else
    echo -e "${GREEN}  Camera detected${NC}"
fi

# Enable I2C for the BH1750 light sensor
echo ""
echo "Enabling I2C (BH1750 light sensor)..."
sudo raspi-config nonint do_i2c 0 || echo -e "${YELLOW}Warning: Could not enable I2C automatically${NC}"

# Update system
echo ""
echo "Updating package lists..."
sudo apt update

# Install dependencies
echo ""
echo "Installing dependencies..."
sudo apt install -y \
    python3-pip \
    python3-flask \
    python3-yaml \
    libcamera-dev \
    libcamera-tools \
    i2c-tools \
    ffmpeg  # Required for HLS streaming

# Reload PATH after apt installs
hash -r 2>/dev/null || true

# Install Python packages via pip for newer versions (system-wide for systemd)
echo ""
echo "Installing Python packages..."
sudo pip3 install --break-system-packages flask 2>/dev/null || \
sudo pip3 install flask

# smbus2 (BH1750 I2C) and paho-mqtt (SignalK deltas): apt first, pip fallback
sudo apt install -y python3-smbus2 python3-paho-mqtt 2>/dev/null || {
    sudo pip3 install --break-system-packages smbus2 paho-mqtt 2>/dev/null || \
    sudo pip3 install smbus2 paho-mqtt
}

# Detect BH1750 on the I2C bus (0x23 default, 0x5C if ADDR pulled high)
echo ""
echo "Checking BH1750 light sensor..."
if i2cdetect -y 1 2>/dev/null | grep -qE "(^| )(23|5c)( |$)"; then
    echo -e "${GREEN}  BH1750 detected on I2C bus 1${NC}"
else
    echo -e "${YELLOW}Warning: BH1750 not detected on I2C bus 1${NC}"
    echo "  Wiring: VCC->3.3V (pin 1), GND->pin 6, SDA->GPIO2 (pin 3), SCL->GPIO3 (pin 5)"
    echo "  A reboot may be required after enabling I2C"
fi

# Create installation directory
echo ""
echo "Creating installation directory..."
sudo mkdir -p "$INSTALL_DIR"
sudo chown "$USER_NAME:$USER_NAME" "$INSTALL_DIR"

# Copy files
echo ""
echo "Copying application files..."
cp -v "$SCRIPT_DIR/main.py" "$INSTALL_DIR/"
cp -v "$SCRIPT_DIR/camera_manager.py" "$INSTALL_DIR/"
cp -v "$SCRIPT_DIR/light_sensor.py" "$INSTALL_DIR/"
cp -v "$SCRIPT_DIR/config.yaml" "$INSTALL_DIR/"

# Set permissions
echo ""
echo "Setting permissions..."
chmod +x "$INSTALL_DIR/main.py"
chmod +x "$INSTALL_DIR/camera_manager.py"

# Add user to video and i2c groups
echo ""
echo "Adding user to video and i2c groups..."
sudo usermod -a -G video,i2c "$USER_NAME"

# Create log directory
echo ""
echo "Creating log directory..."
sudo mkdir -p /var/log
sudo touch /var/log/signalk_pi_pond_video.log
sudo chown "$USER_NAME:$USER_NAME" /var/log/signalk_pi_pond_video.log

# Install systemd service
echo ""
echo "Installing systemd service..."
# Update service file with current user
sed "s/^User=pi$/User=$USER_NAME/" "$SCRIPT_DIR/signalk-pi-pond-video.service" | sudo tee /etc/systemd/system/signalk-pi-pond-video.service > /dev/null
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"

# Create log rotation config
echo ""
echo "Setting up log rotation..."
sudo tee /etc/logrotate.d/signalk-pi-pond-video > /dev/null << EOF
/var/log/signalk_pi_pond_video.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 644 $USER_NAME $USER_NAME
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
