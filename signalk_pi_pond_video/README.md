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

# Enable camera interface
sudo raspi-config
# Navigate to: Interface Options > Camera > Enable
# Reboot when prompted
```

### 2. Install Dependencies

```bash
# Install required packages
sudo apt install -y python3-pip python3-picamera2 python3-flask python3-websocket

# Or install from requirements.txt
cd ~/signalk_pi_pond_video
pip3 install -r requirements.txt
```

### 3. Configure WiFi

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

### 4. Copy Project Files

```bash
# Copy to /opt for system service
git clone https://github.com/your-repo/signalk_pi_pond_video.git
cd signalk_pi_pond_video
sudo mkdir -p /opt/signalk_pi_pond_video
sudo cp -r src/* /opt/signalk_pi_pond_video/
sudo cp config.yaml /opt/signalk_pi_pond_video/
```

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

### 6. Create System Service

```bash
sudo nano /etc/systemd/system/signalk-pi-pond-video.service
```

Paste:
```ini
[Unit]
Description=SignalK Pi Pond Video Streaming Server
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/opt/signalk_pi_pond_video
ExecStart=/usr/bin/python3 /opt/signalk_pi_pond_video/main.py
Restart=always
RestartSec=5
Environment="PYTHONUNBUFFERED=1"

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
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

### Performance Issues
- Lower resolution: `640x480` for Pi Zero
- Reduce framerate: `10` fps
- Decrease JPEG quality: `70`
- Enable GPU memory split in `raspi-config`

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
