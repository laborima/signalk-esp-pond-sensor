#!/usr/bin/env python3
"""
SignalK Pi Pond Video - Main Application

A lightweight video streaming server for Raspberry Pi Zero WH with Camera Module v3.
Provides MJPEG and WebSocket streaming compatible with SignalK/POI Laboratory dashboard.

Features:
- HTTP REST API for camera control
- MJPEG streaming endpoint
- WebSocket binary streaming
- Auto-sleep power saving
- Night standby mode
- Runtime camera configuration

@author Matthieu Laborie
@version 1.0.0
"""

import os
import sys
import time
import yaml
import json
import logging
import signal
import threading
from datetime import datetime
from typing import Optional, Dict, Any

from flask import Flask, Response, request, jsonify
from flask_socketio import SocketIO, emit

from camera_manager import CameraManager


# ============================================================================
# Configuration
# ============================================================================

DEFAULT_CONFIG = {
    'device': {
        'name': 'pi-pond-cam',
        'stream_port': 8080,
        'host': '0.0.0.0'
    },
    'camera': {
        'resolution': '1280x720',
        'framerate': 15,
        'jpeg_quality': 85,
        'rotation': 180,
        'hflip': False,
        'vflip': True,
        'awb_mode': 'auto',
        'exposure_mode': 'auto',
        'meter_mode': 'average'
    },
    'power': {
        'auto_sleep_timeout': 600,
        'night_standby': {
            'enabled': True,
            'start_hour': 22,
            'end_hour': 7
        }
    },
    'logging': {
        'level': 'INFO',
        'log_file': '/var/log/signalk_pi_pond_video.log'
    }
}


def load_config(config_path: str = 'config.yaml') -> Dict[str, Any]:
    """Load configuration from YAML file."""
    config = DEFAULT_CONFIG.copy()
    
    if os.path.exists(config_path):
        try:
            with open(config_path, 'r') as f:
                user_config = yaml.safe_load(f)
                if user_config:
                    # Merge user config with defaults
                    for section, values in user_config.items():
                        if section in config:
                            if isinstance(values, dict):
                                config[section].update(values)
                            else:
                                config[section] = values
                        else:
                            config[section] = values
            logging.info(f"Configuration loaded from {config_path}")
        except Exception as e:
            logging.warning(f"Failed to load config file: {e}. Using defaults.")
    else:
        logging.warning(f"Config file not found: {config_path}. Using defaults.")
    
    return config


# ============================================================================
# Application State
# ============================================================================

class AppState:
    """Manages application state and camera lifecycle."""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.camera_manager: Optional[CameraManager] = None
        self.last_activity = time.time()
        self.stream_clients = 0
        self.ws_clients = 0
        self.start_time = time.time()
        self.running = True
        self._lock = threading.Lock()
        
    def is_night_standby(self) -> bool:
        """Check if currently in night standby hours."""
        standby_config = self.config['power'].get('night_standby', {})
        if not standby_config.get('enabled', False):
            return False
            
        start_hour = standby_config.get('start_hour', 22)
        end_hour = standby_config.get('end_hour', 7)
        current_hour = datetime.now().hour
        
        if start_hour > end_hour:  # Overnight period (e.g., 22:00 - 07:00)
            return current_hour >= start_hour or current_hour < end_hour
        else:  # Same day period
            return start_hour <= current_hour < end_hour
    
    def touch_activity(self):
        """Update last activity timestamp."""
        with self._lock:
            self.last_activity = time.time()
    
    def should_auto_sleep(self) -> bool:
        """Check if camera should auto-sleep due to inactivity."""
        if not self.camera_manager or not self.camera_manager.is_awake:
            return False
            
        if self.stream_clients > 0 or self.ws_clients > 0:
            return False
            
        timeout = self.config['power'].get('auto_sleep_timeout', 600)
        inactive_time = time.time() - self.last_activity
        return inactive_time >= timeout
    
    def get_status(self) -> Dict[str, Any]:
        """Get current device status."""
        import subprocess
        
        # Get WiFi RSSI
        wifi_rssi = None
        try:
            result = subprocess.run(
                ['iwconfig'], capture_output=True, text=True
            )
            for line in result.stdout.split('\n'):
                if 'Signal level' in line or 'level=' in line:
                    # Parse signal level
                    parts = line.split()
                    for part in parts:
                        if 'level=' in part or 'dBm' in part:
                            try:
                                wifi_rssi = int(part.split('=')[-1].replace('dBm', ''))
                            except:
                                pass
                            break
        except:
            pass
        
        status = {
            'device': self.config['device']['name'],
            'camera_awake': self.camera_manager.is_awake if self.camera_manager else False,
            'camera_ready': self.camera_manager.is_initialized if self.camera_manager else False,
            'standby': self.is_night_standby(),
            'streaming': self.stream_clients > 0 or self.ws_clients > 0,
            'ws_clients': self.ws_clients,
            'stream_clients': self.stream_clients,
            'stream_url': f"http://{self.get_ip()}:{self.config['device']['stream_port']}/stream",
            'ws_url': f"ws://{self.get_ip()}:{self.config['device']['stream_port']}/ws",
            'wifi_rssi': wifi_rssi,
            'uptime': int(time.time() - self.start_time),
            'local_time': datetime.now().strftime('%H:%M:%S')
        }
        
        return status
    
    @staticmethod
    def get_ip() -> str:
        """Get primary IP address."""
        import socket
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except:
            return "127.0.0.1"


# ============================================================================
# Flask Application
# ============================================================================

def create_app(config: Dict[str, Any]) -> tuple:
    """Create Flask app and SocketIO instance."""
    app = Flask(__name__)
    app.config['SECRET_KEY'] = 'signalk-pi-pond-video-secret'
    socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')
    
    state = AppState(config)
    
    # Initialize camera manager
    state.camera_manager = CameraManager(config['camera'])
    
    # =========================================================================
    # Routes
    # =========================================================================
    
    @app.route('/')
    def index():
        """Root endpoint - returns device status."""
        state.touch_activity()
        response = jsonify(state.get_status())
        response.headers.add('Access-Control-Allow-Origin', '*')
        return response
    
    @app.route('/wake', methods=['GET', 'POST', 'OPTIONS'])
    def wake():
        """Wake the camera from sleep mode."""
        if request.method == 'OPTIONS':
            response = jsonify({})
            response.headers.add('Access-Control-Allow-Origin', '*')
            response.headers.add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
            return response, 204
        
        if state.is_night_standby():
            response = jsonify({
                'status': 'standby',
                'message': 'Night mode active'
            })
            response.headers.add('Access-Control-Allow-Origin', '*')
            return response, 503
        
        state.touch_activity()
        
        if not state.camera_manager.wake():
            response = jsonify({
                'status': 'error',
                'message': 'Camera wake failed'
            })
            response.headers.add('Access-Control-Allow-Origin', '*')
            return response, 500
        
        response = jsonify({
            'status': 'awake',
            'stream_url': f"http://{AppState.get_ip()}:{config['device']['stream_port']}/stream",
            'ws_url': f"ws://{AppState.get_ip()}:{config['device']['stream_port']}/ws"
        })
        response.headers.add('Access-Control-Allow-Origin', '*')
        return response
    
    @app.route('/sleep', methods=['GET', 'POST', 'OPTIONS'])
    def sleep():
        """Put the camera to sleep."""
        if request.method == 'OPTIONS':
            response = jsonify({})
            response.headers.add('Access-Control-Allow-Origin', '*')
            response.headers.add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
            return response, 204
        
        state.camera_manager.sleep()
        response = jsonify({'status': 'sleeping'})
        response.headers.add('Access-Control-Allow-Origin', '*')
        return response
    
    @app.route('/capture', methods=['GET', 'OPTIONS'])
    def capture():
        """Capture a single JPEG frame."""
        if request.method == 'OPTIONS':
            response = jsonify({})
            response.headers.add('Access-Control-Allow-Origin', '*')
            response.headers.add('Access-Control-Allow-Methods', 'GET, OPTIONS')
            return response, 204
        
        if state.is_night_standby():
            response = jsonify({'error': 'Night standby active'})
            response.headers.add('Access-Control-Allow-Origin', '*')
            return response, 503
        
        if not state.camera_manager.is_awake:
            if not state.camera_manager.wake():
                response = jsonify({'error': 'Camera wake failed'})
                response.headers.add('Access-Control-Allow-Origin', '*')
                return response, 503
            time.sleep(0.5)
        
        state.touch_activity()
        frame = state.camera_manager.capture_frame()
        
        if frame is None:
            response = jsonify({'error': 'Capture failed'})
            response.headers.add('Access-Control-Allow-Origin', '*')
            return response, 500
        
        response = Response(frame, mimetype='image/jpeg')
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Cache-Control', 'no-cache')
        return response
    
    @app.route('/stream', methods=['GET', 'OPTIONS'])
    def stream():
        """MJPEG streaming endpoint."""
        if request.method == 'OPTIONS':
            response = jsonify({})
            response.headers.add('Access-Control-Allow-Origin', '*')
            response.headers.add('Access-Control-Allow-Methods', 'GET, OPTIONS')
            return response, 204
        
        if state.is_night_standby():
            return 'Night standby active', 503
        
        if not state.camera_manager.is_awake:
            if not state.camera_manager.wake():
                return 'Camera wake failed', 503
            time.sleep(0.5)
        
        state.touch_activity()
        state.stream_clients += 1
        
        def generate():
            boundary = b'--frame\r\n'
            try:
                while state.camera_manager.is_awake:
                    state.touch_activity()
                    frame = state.camera_manager.capture_frame()
                    if frame:
                        yield boundary
                        yield b'Content-Type: image/jpeg\r\n'
                        yield f'Content-Length: {len(frame)}\r\n\r\n'.encode()
                        yield frame
                        yield b'\r\n'
                    time.sleep(0.033)  # ~30 fps max
            finally:
                state.stream_clients -= 1
                state.touch_activity()
        
        response = Response(
            generate(),
            mimetype='multipart/x-mixed-replace; boundary=frame'
        )
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Cache-Control', 'no-cache, no-store, must-revalidate')
        return response
    
    @app.route('/config', methods=['GET', 'POST', 'OPTIONS'])
    def config():
        """Camera configuration endpoint."""
        if request.method == 'OPTIONS':
            response = jsonify({})
            response.headers.add('Access-Control-Allow-Origin', '*')
            response.headers.add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
            return response, 204
        
        response_headers = {'Access-Control-Allow-Origin': '*'}
        
        if request.method == 'POST':
            # Handle reset
            if request.args.get('reset') == '1':
                state.camera_manager.reset_settings()
                logging.info("Camera settings reset to defaults")
            else:
                # Apply individual settings
                settings_map = {
                    'brightness': ('brightness', -100, 100),
                    'contrast': ('contrast', -100, 100),
                    'saturation': ('saturation', -100, 100),
                    'sharpness': ('sharpness', -100, 100),
                    'exposure': ('exposure', -13, -1),
                    'iso': ('iso', 100, 800),
                    'quality': ('quality', 1, 100),
                    'rotation': ('rotation', 0, 270),
                    'hflip': ('hflip', 0, 1),
                    'vflip': ('vflip', 0, 1)
                }
                
                for param, (key, min_val, max_val) in settings_map.items():
                    if param in request.args:
                        try:
                            value = int(request.args[param])
                            if min_val <= value <= max_val:
                                state.camera_manager.set_setting(key, value)
                                logging.info(f"Camera setting {key} = {value}")
                        except ValueError:
                            pass
        
        current_settings = state.camera_manager.get_settings()
        response = jsonify(current_settings)
        for key, value in response_headers.items():
            response.headers.add(key, value)
        return response
    
    # =========================================================================
    # WebSocket Events
    # =========================================================================
    
    @socketio.on('connect')
    def handle_connect():
        """Handle WebSocket client connection."""
        logging.info(f"WebSocket client connected: {request.sid}")
        state.ws_clients += 1
        state.touch_activity()
        
        if not state.camera_manager.is_awake:
            state.camera_manager.wake()
    
    @socketio.on('disconnect')
    def handle_disconnect():
        """Handle WebSocket client disconnection."""
        logging.info(f"WebSocket client disconnected: {request.sid}")
        if state.ws_clients > 0:
            state.ws_clients -= 1
        state.touch_activity()
    
    # =========================================================================
    # Background Tasks
    # =========================================================================
    
    def auto_sleep_monitor():
        """Background thread to monitor and trigger auto-sleep."""
        while state.running:
            if state.should_auto_sleep():
                logging.info("Auto-sleep triggered due to inactivity")
                state.camera_manager.sleep()
            time.sleep(5)
    
    # Start auto-sleep monitor
    sleep_thread = threading.Thread(target=auto_sleep_monitor, daemon=True)
    sleep_thread.start()
    
    return app, socketio, state


# ============================================================================
# Main Entry Point
# ============================================================================

def setup_logging(config: Dict[str, Any]):
    """Configure logging."""
    log_config = config.get('logging', {})
    level = getattr(logging, log_config.get('level', 'INFO').upper())
    log_file = log_config.get('log_file')
    
    handlers = [logging.StreamHandler(sys.stdout)]
    if log_file:
        try:
            os.makedirs(os.path.dirname(log_file), exist_ok=True)
            handlers.append(logging.FileHandler(log_file))
        except Exception as e:
            print(f"Warning: Could not create log file: {e}")
    
    logging.basicConfig(
        level=level,
        format='%(asctime)s - %(levelname)s - %(message)s',
        handlers=handlers
    )


def main():
    """Main application entry point."""
    # Load configuration
    config_path = os.environ.get('CONFIG_PATH', 'config.yaml')
    config = load_config(config_path)
    
    # Setup logging
    setup_logging(config)
    
    logging.info("=" * 60)
    logging.info("SignalK Pi Pond Video - Starting up")
    logging.info(f"Device: {config['device']['name']}")
    logging.info(f"Port: {config['device']['stream_port']}")
    logging.info("=" * 60)
    
    # Create Flask app
    app, socketio, state = create_app(config)
    
    # Signal handlers for graceful shutdown
    def signal_handler(signum, frame):
        logging.info("Shutdown signal received")
        state.running = False
        if state.camera_manager:
            state.camera_manager.sleep()
        sys.exit(0)
    
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)
    
    # Run server
    try:
        socketio.run(
            app,
            host=config['device']['host'],
            port=config['device']['stream_port'],
            debug=False,
            use_reloader=False,
            allow_unsafe_werkzeug=True
        )
    except KeyboardInterrupt:
        logging.info("Keyboard interrupt received")
        state.running = False
        if state.camera_manager:
            state.camera_manager.sleep()


if __name__ == '__main__':
    main()
