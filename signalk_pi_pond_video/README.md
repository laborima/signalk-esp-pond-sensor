# SignalK Pi Pond Video

A lightweight video streaming server for **Raspberry Pi Zero WH** with **Camera Module v3** (Standard 75° angle). Streams video to the POI Laboratory dashboard via SignalK-compatible HTTP/WebSocket APIs.

## Features

- **MJPEG Streaming**: Low-latency video streaming via `/stream` endpoint
- **WebSocket Support**: Binary JPEG frames for real-time dashboard integration
- **Camera Sleep/Wake**: Power-saving mode with on-demand wake via HTTP API
- **REST API**: SignalK-compatible endpoints for status, configuration, and control
- **Auto-sleep**: Configurable inactivity timeout to save power
- **Night Standby**: Optional night mode to refuse connections during specified hours
- **Camera Configuration**: Runtime adjustment of brightness, contrast, saturation, exposure, etc.
- **Optimized for Pi Zero WH**: Low CPU usage, efficient memory management

## Hardware Requirements

- **Raspberry Pi Zero WH** (Wireless with Header)
- **Raspberry Pi Camera Module v3** (Standard 75° angle)
- **Power Supply**: 5V 2.5A micro-USB or GPIO
- **WiFi Network**: 2.4 GHz for Pi Zero WH

## Installation

### 1. Prepare the Raspberry Pi

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Camera is auto-detected on modern Pi OS (Bullseye/Bookworm)
# Install libcamera tools:
sudo apt install -y libcamera-dev libcamera-tools python3-picamera2

# Verify camera detection:
# Pi OS 12 (Bookworm): rpicam-hello
# Pi OS 11 (Bullseye): libcamera-hello
rpicam-hello --list-cameras 2>/dev/null || libcamera-hello --list-cameras 2>/dev/null

# If camera not detected, check ribbon cable orientation
# (Blue/black side faces HDMI port)

# On older Legacy OS only: sudo raspi-config -> Interface Options -> Camera
```

### 2. Install Git and Clone Repository

```bash
# Install git
sudo apt install -y git

# Clone repository
git clone https://github.com/laborima/signalk-esp-pond-sensor.git

# Navigate to Pi video directory
cd signalk-esp-pond-sensor/signalk_pi_pond_video
```

### 3. Install Dependencies

Option A - Using install.sh (recommended):

```bash
chmod +x install.sh
./install.sh
```

Option B - Manual installation:

```bash
# Install system packages
sudo apt install -y python3-pip python3-picamera2 python3-flask python3-yaml python3-pil libcamera-dev

# Install Python packages
pip3 install --user flask-socketio python-socketio eventlet

# Copy files manually
sudo mkdir -p /opt/signalk_pi_pond_video
sudo cp *.py /opt/signalk_pi_pond_video/
sudo cp config.yaml /opt/signalk_pi_pond_video/
```

### 4. Configure WiFi

```bash
# Edit wpa_supplicant.conf
sudo nano /etc/wpa_supplicant/wpa_supplicant.conf
```

Add your network:

```
network={
    ssid="YOUR_WIFI_SSID"
    psk="YOUR_WIFI_PASSWORD"
    key_mgmt=WPA-PSK
}
```

Then reboot: `sudo reboot`

### 5. Configure the Application

```bash
sudo nano /opt/signalk_pi_pond_video/config.yaml
```

Edit settings:
```yaml
device:
  name: "pi-pond-cam"
  stream_port: 8080
  
camera:
  resolution: "1280x720"  # Options: 640x480, 1280x720, 1920x1080
  framerate: 15
  jpeg_quality: 85        # 1-100, higher = better quality
  
power:
  auto_sleep_timeout: 600  # Seconds (10 minutes)
  night_standby:
    enabled: true
    start_hour: 22
    end_hour: 7
```

### 6. Start the Service

If you used **install.sh** (Option A), the service is already created and enabled. Just start it:
```bash
sudo systemctl start signalk-pi-pond-video
```

If you did **manual installation** (Option B), create the service:
```bash
sudo cp signalk-pi-pond-video.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable signalk-pi-pond-video
sudo systemctl start signalk-pi-pond-video
```

### 7. Verify Installation

```bash
# Check service status
sudo systemctl status signalk-pi-pond-video

# View logs
sudo journalctl -u signalk-pi-pond-video -f

# Test endpoints
curl http://raspberrypi.local:8080/
curl http://raspberrypi.local:8080/wake
```

## API Endpoints

### Status
```
GET /
```
Returns device status as JSON:
```json
{
  "device": "pi-pond-cam",
  "camera_awake": true,
  "camera_ready": true,
  "standby": false,
  "streaming": true,
  "ws_clients": 1,
  "stream_url": "http://192.168.1.100:8080/stream",
  "ws_url": "ws://192.168.1.100:8080/ws",
  "wifi_rssi": -45,
  "uptime": 3600
}
```

### Wake Camera
```
POST /wake
```
Wakes the camera from sleep mode. Returns stream URLs on success.

### Sleep Camera
```
POST /sleep
```
Puts the camera to sleep to save power.

### MJPEG Stream
```
GET /stream
```
MJPEG stream for browser compatibility.

### WebSocket Stream
```
WS /ws
```
Binary WebSocket for low-latency streaming.

### Capture Single Frame
```
GET /capture
```
Returns a single JPEG image.

### Camera Configuration
```
GET /config
POST /config?brightness=0&contrast=1
```

Supported parameters:
- `brightness`: -100 to 100
- `contrast`: -100 to 100
- `saturation`: -100 to 100
- `sharpness`: -100 to 100
- `exposure`: -13 to -1 (EV stops)
- `iso`: 100 to 800
- `quality`: 1 to 100 (JPEG quality)

## SignalK Integration

The server is designed to integrate with the POI Laboratory dashboard. Add to your SignalK server configuration:

```json
{
  "pondVideo": {
    "url": "http://raspberrypi.local:8080",
    "enabled": true
  }
}
```

## Troubleshooting

### Camera Not Detected
```bash
# Check camera detection
libcamera-hello --list-cameras

# Verify camera module
vcgencmd get_camera
```

### Permission Issues
```bash
# Add user to video group
sudo usermod -a -G video pi
```

### Performance Issues (Pi Zero WH)

The Pi Zero WH has limited CPU power. For smooth streaming, use these settings in `config.yaml`:

```yaml
camera:
  resolution: "640x480"    # Default: 640x480 (was 1280x720)
  framerate: 10            # Default: 10 fps (was 15)
  jpeg_quality: 70         # Default: 70 (was 85)
```

Additional optimizations:
- Enable GPU memory split in `sudo raspi-config` -> Advanced Options -> Memory Split (set to 128MB or higher)
- Disable HDMI if not needed: `sudo /opt/vc/bin/tvservice -o`
- Lower CPU frequency to reduce heat: add `arm_freq=600` to `/boot/config.txt`

### Network Issues
```bash
# Check WiFi signal
iwconfig

# Test connectivity
ping -c 4 8.8.8.8
```

## Power Optimization

For battery-powered installations:

1. **Enable auto-sleep**: Set `auto_sleep_timeout: 300` (5 minutes)
2. **Use night standby**: Configure `night_standby` hours
3. **Disable HDMI**: `sudo /opt/vc/bin/tvservice -o`
4. **Disable Bluetooth**: Add `dtoverlay=disable-bt` to `/boot/config.txt`
5. **CPU frequency**: Add `arm_freq=600` to `/boot/config.txt`

## License

MIT License - See LICENSE file

## Author

Matthieu Laborie - POI Laboratory
