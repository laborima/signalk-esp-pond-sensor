# SignalK Pi Pond Video - Quick Start Guide

## Hardware Setup

### Components
- Raspberry Pi Zero WH (with pre-soldered header)
- Raspberry Pi Camera Module v3 (Standard 75°)
- 5V 2.5A power supply (micro-USB or GPIO)
- MicroSD card (16GB+ recommended)

### Assembly

1. **Connect the camera** to the Pi Zero WH CSI port:
   ```
   Camera ribbon cable -> Pi Zero CSI (next to HDMI)
   Blue/Black side faces the HDMI port
   ```

2. **Insert MicroSD** with Raspberry Pi OS Lite (64-bit or 32-bit)

3. **Power on** the Pi Zero WH

## Software Installation (5 minutes)

### 1. Check Camera (Auto-detected)

Sur Raspberry Pi OS Bullseye/Bookworm, la caméra est détectée automatiquement :

```bash
# Installer les outils libcamera (si pas déjà présents)
sudo apt update
sudo apt install -y libcamera-apps

# Vérifier que la caméra est reconnue
libcamera-hello --list-cameras

# Si la caméra n'est pas détectée, vérifier le câble ribbon
# (côté bleu/noir vers le port HDMI)
```

Note : Sur les anciennes versions (Legacy), utilisez `sudo raspi-config` -> Interface Options -> Camera.

### 2. Install Git and Clone
```bash
# Install git if not present
sudo apt update
sudo apt install -y git

# Clone repository
cd ~
git clone https://github.com/laborima/signalk-esp-pond-sensor.git
cd signalk-esp-pond-sensor/signalk_pi_pond_video

# Run installer
chmod +x install.sh
./install.sh
```

### 3. Configure (Optional)
```bash
sudo nano /opt/signalk_pi_pond_video/config.yaml
# Adjust resolution, framerate, night standby hours
```

### 4. Start Service
```bash
sudo systemctl start signalk-pi-pond-video
```

### 5. Verify
```bash
# Check service status
sudo systemctl status signalk-pi-pond-video

# Test endpoints
curl http://$(hostname -I | awk '{print $1}'):8080/
curl http://$(hostname -I | awk '{print $1}'):8080/wake -X POST
```

## Dashboard Integration

Add to your SignalK/POI Lab dashboard:

```javascript
{
  "pondVideo": {
    "url": "http://pi-zero-ip:8080",
    "enabled": true
  }
}
```

## Troubleshooting

### Camera not detected
```bash
# Check connection
libcamera-hello --list-cameras

# Check ribbon cable orientation
# Blue side faces HDMI port
```

### Permission denied
```bash
# Re-login or run
newgrp video
```

### Low frame rate
```bash
# Edit config and reduce resolution
sudo nano /opt/signalk_pi_pond_video/config.yaml
# Set: resolution: "640x480"
# Set: framerate: 10
sudo systemctl restart signalk-pi-pond-video
```

### Service won't start
```bash
# Check logs
sudo journalctl -u signalk-pi-pond-video -f

# Check Python dependencies
pip3 list | grep -E "(flask|picamera|socketio)"
```

## Useful Commands

```bash
# Start/stop/restart
sudo systemctl start signalk-pi-pond-video
sudo systemctl stop signalk-pi-pond-video
sudo systemctl restart signalk-pi-pond-video

# View logs
sudo journalctl -u signalk-pi-pond-video -f

# Test capture
curl http://localhost:8080/capture -o test.jpg

# Manual run (for debugging)
cd /opt/signalk_pi_pond_video
python3 main.py
```

## API Quick Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Device status |
| `/wake` | POST | Wake camera |
| `/sleep` | POST | Sleep camera |
| `/stream` | GET | MJPEG stream |
| `/ws` | WS | WebSocket stream |
| `/capture` | GET | Single JPEG |
| `/config` | GET/POST | Camera settings |
