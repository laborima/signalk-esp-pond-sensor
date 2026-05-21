#!/usr/bin/env python3
"""
Camera Manager Module for SignalK Pi Pond Video

Manages Raspberry Pi Camera Module v3 using rpicam-vid + mediamtx.
Provides H.264 hardware encoding with RTSP/HLS streaming.

@author Matthieu Laborie
"""

import os
import io
import time
import logging
import subprocess
import signal
from typing import Optional, Dict, Any, Tuple
from threading import Lock


class CameraManager:
    """
    Manages Raspberry Pi Camera using rpicam-vid + mediamtx.
    
    Features:
    - H.264 hardware encoding (efficient on Pi Zero)
    - RTSP and HLS streaming
    - Sleep/wake for power saving
    - Runtime parameter adjustment
    - Thread-safe operations
    """
    
    # Resolution mapping
    RESOLUTIONS = {
        '640x480': (640, 480),
        '1280x720': (1280, 720),
        '1920x1080': (1920, 1080),
    }
    
    # Default camera settings
    DEFAULT_SETTINGS = {
        'brightness': 0,
        'contrast': 0,
        'saturation': 0,
        'sharpness': 1,
        'exposure': -6,
        'iso': 100,
        'quality': 23,  # H.264 CRF (23=good balance, lower=better quality)
        'bitrate': 2000000,  # 2 Mbps for Pi Zero
        'rotation': 180,
        'hflip': 0,
        'vflip': 1,
        'framerate': 25,
    }
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize camera manager.
        
        @param config: Camera configuration dictionary
        """
        self.config = config
        self._rpicam_process: Optional[subprocess.Popen] = None
        self._is_awake = False
        self._is_initialized = False
        self._lock = Lock()
        self._settings = self.DEFAULT_SETTINGS.copy()
        self._fifo_path = "/tmp/camera_fifo"
        self._rtsp_port = config.get('rtsp_port', 8554)
        self._hls_port = config.get('hls_port', 8888)
        
        # Apply config overrides
        self._apply_config_settings()
        
        # Create FIFO for rpicam-vid
        self._create_fifo()
        
        logging.info("CameraManager initialized (H.264/RTSP mode)")
    
    def _create_fifo(self):
        """Create FIFO for video pipe."""
        try:
            if os.path.exists(self._fifo_path):
                os.remove(self._fifo_path)
            os.mkfifo(self._fifo_path)
        except Exception as e:
            logging.warning(f"Failed to create FIFO: {e}")
    
    def _apply_config_settings(self):
        """Apply initial settings from configuration."""
        for key in ['brightness', 'contrast', 'saturation', 'sharpness', 
                    'exposure', 'iso', 'quality', 'bitrate', 'framerate']:
            if key in self.config:
                self._settings[key] = self.config[key]
        
        if 'rotation' in self.config:
            self._settings['rotation'] = self.config['rotation']
        if 'hflip' in self.config:
            self._settings['hflip'] = 1 if self.config['hflip'] else 0
        if 'vflip' in self.config:
            self._settings['vflip'] = 1 if self.config['vflip'] else 0
    
    @property
    def is_awake(self) -> bool:
        """Check if camera is currently awake and active."""
        return self._is_awake
    
    @property
    def is_initialized(self) -> bool:
        """Check if camera has been initialized."""
        return self._is_initialized
    
    def wake(self) -> bool:
        """
        Wake up and start H.264 streaming via rpicam-vid.
        
        @return: True if camera successfully initialized
        """
        with self._lock:
            if self._is_awake and self._is_initialized:
                return True
            
            try:
                logging.info("Starting H.264 streaming...")
                
                resolution = self._get_resolution()
                width, height = resolution
                framerate = self._settings.get('framerate', 25)
                bitrate = self._settings.get('bitrate', 2000000)
                rotation = self._settings.get('rotation', 0)
                hflip = self._settings.get('hflip', 0)
                vflip = self._settings.get('vflip', 0)
                
                # Build rpicam-vid command for hardware H.264 encoding
                cmd = [
                    'rpicam-vid',
                    '-t', '0',  # Run indefinitely
                    '--width', str(width),
                    '--height', str(height),
                    '--framerate', str(framerate),
                    '--bitrate', str(bitrate),
                    '--codec', 'h264',
                    '--inline',  # For HLS compatibility
                    '--listen', '-o', f'tcp://0.0.0.0:{self._rtsp_port}',  # TCP output for mediamtx
                ]
                
                # Add rotation if needed
                if rotation == 180:
                    cmd.extend(['--rotation', '180'])
                elif rotation == 90:
                    cmd.extend(['--rotation', '90'])
                elif rotation == 270:
                    cmd.extend(['--rotation', '270'])
                
                # Add flips
                if hflip:
                    cmd.append('--hflip')
                if vflip:
                    cmd.append('--vflip')
                
                logging.info(f"Starting rpicam-vid: {' '.join(cmd)}")
                
                # Start rpicam-vid process
                self._rpicam_process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    preexec_fn=os.setsid  # Create new process group for clean shutdown
                )
                
                # Wait a moment for stream to start
                time.sleep(2)
                
                # Check if process is running
                if self._rpicam_process.poll() is not None:
                    logging.error("rpicam-vid exited immediately")
                    self._cleanup_camera()
                    return False
                
                self._is_awake = True
                self._is_initialized = True
                
                logging.info(f"H.264 streaming active - {width}x{height}@{framerate}fps, "
                           f"bitrate={bitrate/1000000:.1f}Mbps on port {self._rtsp_port}")
                return True
                
            except Exception as e:
                logging.error(f"Camera wake failed: {e}")
                self._cleanup_camera()
                return False
    
    def sleep(self) -> None:
        """Stop H.264 streaming and release resources."""
        with self._lock:
            if not self._is_awake:
                return
            
            logging.info("Stopping H.264 streaming...")
            self._cleanup_camera()
            self._is_awake = False
            logging.info("Camera sleeping")
    
    def _cleanup_camera(self):
        """Clean up rpicam-vid process."""
        try:
            if self._rpicam_process:
                # Terminate the process group (rpicam-vid + children)
                os.killpg(os.getpgid(self._rpicam_process.pid), signal.SIGTERM)
                try:
                    self._rpicam_process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    # Force kill if not terminated
                    os.killpg(os.getpgid(self._rpicam_process.pid), signal.SIGKILL)
        except Exception as e:
            logging.warning(f"Error during camera cleanup: {e}")
        finally:
            self._rpicam_process = None
    
    def capture_frame(self) -> Optional[bytes]:
        """
        Capture a single JPEG frame using rpicam-still.
        
        @return: JPEG image data or None if capture failed
        """
        with self._lock:
            try:
                resolution = self._get_resolution()
                width, height = resolution
                rotation = self._settings.get('rotation', 0)
                hflip = self._settings.get('hflip', 0)
                vflip = self._settings.get('vflip', 0)
                quality = self._settings.get('quality', 85)
                
                # Map CRF to JPEG quality (approximate)
                if quality < 20:  # CRF mode
                    jpeg_quality = max(10, min(95, (30 - quality) * 3))
                else:
                    jpeg_quality = quality
                
                output_path = "/tmp/snapshot.jpg"
                
                cmd = [
                    'rpicam-still',
                    '-t', '1',  # Quick capture
                    '--width', str(width),
                    '--height', str(height),
                    '-q', str(jpeg_quality),
                    '-o', output_path,
                ]
                
                # Add rotation
                if rotation == 180:
                    cmd.extend(['--rotation', '180'])
                elif rotation == 90:
                    cmd.extend(['--rotation', '90'])
                elif rotation == 270:
                    cmd.extend(['--rotation', '270'])
                
                # Add flips
                if hflip:
                    cmd.append('--hflip')
                if vflip:
                    cmd.append('--vflip')
                
                # Capture frame
                subprocess.run(cmd, capture_output=True, timeout=10)
                
                # Read the captured image
                with open(output_path, 'rb') as f:
                    return f.read()
                
            except Exception as e:
                logging.error(f"Frame capture failed: {e}")
                return None
    
    def set_setting(self, key: str, value: Any) -> bool:
        """
        Update a camera setting.
        
        Note: For rpicam-vid, changing most settings requires stream restart.
        
        @param key: Setting name
        @param value: New value
        @return: True if setting was applied
        """
        with self._lock:
            if key not in self._settings:
                logging.warning(f"Unknown camera setting: {key}")
                return False
            
            old_value = self._settings[key]
            self._settings[key] = value
            
            # For rpicam-vid, settings that affect the stream require restart
            restart_settings = ['resolution', 'framerate', 'bitrate', 'quality', 
                                'rotation', 'hflip', 'vflip']
            
            if self._is_awake and key in restart_settings:
                logging.info(f"Setting '{key}' changed, restarting stream...")
                self._cleanup_camera()
                time.sleep(0.5)  # Brief pause
                self.wake()
            
            logging.debug(f"Camera setting updated: {key} = {value}")
            return True
    
    def get_settings(self) -> Dict[str, Any]:
        """Get current camera settings."""
        return self._settings.copy()
    
    def reset_settings(self) -> None:
        """Reset all settings to defaults."""
        with self._lock:
            was_awake = self._is_awake
            if was_awake:
                self._cleanup_camera()
            
            self._settings = self.DEFAULT_SETTINGS.copy()
            
            if was_awake:
                self.wake()
            
            logging.info("Camera settings reset to defaults")
    
    def _get_resolution(self) -> Tuple[int, int]:
        """Get resolution tuple from config."""
        resolution_str = self.config.get('resolution', '1280x720')
        return self.RESOLUTIONS.get(resolution_str, (1280, 720))
    
    def get_stream_urls(self) -> Dict[str, str]:
        """
        Get RTSP and HLS stream URLs.
        
        @return: Dictionary with 'rtsp' and 'hls' URLs
        """
        # Get Pi's IP address
        import socket
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
        except:
            ip = "127.0.0.1"
        
        return {
            'rtsp': f"rtsp://{ip}:{self._rtsp_port}/live",
            'hls': f"http://{ip}:{self._hls_port}/live/index.m3u8",
            'tcp': f"tcp://{ip}:{self._rtsp_port}",
        }


# Simple test when run directly
if __name__ == '__main__':
    logging.basicConfig(level=logging.DEBUG)
    
    config = {
        'resolution': '1280x720',
        'framerate': 25,
        'bitrate': 2000000,
        'quality': 23,
        'rotation': 180,
        'vflip': True,
        'hflip': False,
        'rtsp_port': 8554,
        'hls_port': 8888,
    }
    
    manager = CameraManager(config)
    
    print("Starting H.264 streaming...")
    if manager.wake():
        urls = manager.get_stream_urls()
        print(f"RTSP stream: {urls['rtsp']}")
        print(f"HLS stream: {urls['hls']}")
        print(f"TCP output: {urls['tcp']}")
        
        print("Capturing test frame...")
        frame = manager.capture_frame()
        if frame:
            print(f"Captured frame: {len(frame)} bytes")
            with open('/tmp/test_capture.jpg', 'wb') as f:
                f.write(frame)
            print("Test image saved to /tmp/test_capture.jpg")
        
        print("Streaming for 10 seconds... (Ctrl+C to stop)")
        try:
            time.sleep(10)
        except KeyboardInterrupt:
            pass
        
        print("Stopping stream...")
        manager.sleep()
        print("Test complete")
    else:
        print("Failed to start streaming")
