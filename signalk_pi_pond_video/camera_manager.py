#!/usr/bin/env python3
"""
Camera Manager Module for SignalK Pi Pond Video

Manages Raspberry Pi Camera Module v3 using picamera2 library.
Provides sleep/wake functionality and runtime configuration.

@author Matthieu Laborie
"""

import io
import time
import logging
from typing import Optional, Dict, Any, Tuple
from threading import Lock

# picamera2 is the modern camera library for Raspberry Pi
try:
    from picamera2 import Picamera2
    from libcamera import controls
    PICAMERA2_AVAILABLE = True
except ImportError:
    PICAMERA2_AVAILABLE = False
    logging.warning("picamera2 not available - camera functions disabled")


class CameraManager:
    """
    Manages Raspberry Pi Camera lifecycle and configuration.
    
    Features:
    - Sleep/wake for power saving
    - Runtime parameter adjustment
    - JPEG frame capture with configurable quality
    - Thread-safe operations
    """
    
    # Resolution mapping
    RESOLUTIONS = {
        '640x480': (640, 480),
        '1280x720': (1280, 720),
        '1920x1080': (1920, 1080),
        '2048x1536': (2048, 1536)  # 3MP for Camera Module v3
    }
    
    # Default camera settings
    DEFAULT_SETTINGS = {
        'brightness': 0,
        'contrast': 0,
        'saturation': 0,
        'sharpness': 1,
        'exposure': -6,
        'iso': 100,
        'quality': 85,
        'rotation': 180,
        'hflip': 0,
        'vflip': 1,
        'awb_mode': 'auto',
        'exposure_mode': 'auto'
    }
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize camera manager.
        
        @param config: Camera configuration dictionary
        """
        self.config = config
        self._camera: Optional[Picamera2] = None
        self._is_awake = False
        self._is_initialized = False
        self._lock = Lock()
        self._settings = self.DEFAULT_SETTINGS.copy()
        
        # Apply config overrides
        self._apply_config_settings()
        
        logging.info("CameraManager initialized")
    
    def _apply_config_settings(self):
        """Apply initial settings from configuration."""
        # Map config values to settings
        if 'brightness' in self.config:
            self._settings['brightness'] = max(-100, min(100, self.config['brightness']))
        if 'contrast' in self.config:
            self._settings['contrast'] = max(-100, min(100, self.config['contrast']))
        if 'saturation' in self.config:
            self._settings['saturation'] = max(-100, min(100, self.config['saturation']))
        if 'sharpness' in self.config:
            self._settings['sharpness'] = max(-100, min(100, self.config['sharpness']))
        if 'jpeg_quality' in self.config:
            self._settings['quality'] = max(1, min(100, self.config['jpeg_quality']))
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
        Wake up and initialize the camera.
        
        @return: True if camera successfully initialized
        """
        with self._lock:
            if self._is_awake and self._is_initialized:
                return True
            
            if not PICAMERA2_AVAILABLE:
                logging.error("Cannot wake camera: picamera2 not available")
                return False
            
            try:
                logging.info("Waking camera...")
                
                # Initialize camera
                self._camera = Picamera2()
                
                # Configure camera
                resolution = self._get_resolution()
                framerate = self.config.get('framerate', 15)
                
                # Create video configuration
                camera_config = self._camera.create_video_configuration(
                    main={"size": resolution},
                    controls={"FrameRate": framerate}
                )
                
                self._camera.configure(camera_config)
                
                # Apply initial settings
                self._apply_settings()
                
                # Start camera
                self._camera.start()
                
                # Allow camera to stabilize
                time.sleep(0.5)
                
                self._is_awake = True
                self._is_initialized = True
                
                logging.info(f"Camera awake - Resolution: {resolution[0]}x{resolution[1]}, "
                           f"FPS: {framerate}")
                return True
                
            except Exception as e:
                logging.error(f"Camera wake failed: {e}")
                self._cleanup_camera()
                return False
    
    def sleep(self) -> None:
        """Put camera to sleep and release resources."""
        with self._lock:
            if not self._is_awake:
                return
            
            logging.info("Putting camera to sleep...")
            self._cleanup_camera()
            self._is_awake = False
            logging.info("Camera sleeping")
    
    def _cleanup_camera(self):
        """Clean up camera resources."""
        try:
            if self._camera:
                self._camera.stop()
                self._camera.close()
        except Exception as e:
            logging.warning(f"Error during camera cleanup: {e}")
        finally:
            self._camera = None
    
    def capture_frame(self) -> Optional[bytes]:
        """
        Capture a single JPEG frame.
        
        @return: JPEG image data or None if capture failed
        """
        with self._lock:
            if not self._is_awake or not self._camera:
                return None
            
            try:
                # Capture frame as numpy array
                frame = self._camera.capture_array()
                
                # Encode to JPEG
                from PIL import Image
                import io
                
                # Convert to PIL Image
                img = Image.fromarray(frame)
                
                # Apply rotation and flips
                if self._settings['rotation'] == 90:
                    img = img.rotate(90, expand=True)
                elif self._settings['rotation'] == 180:
                    img = img.rotate(180, expand=True)
                elif self._settings['rotation'] == 270:
                    img = img.rotate(270, expand=True)
                
                if self._settings['hflip']:
                    img = img.transpose(Image.FLIP_LEFT_RIGHT)
                if self._settings['vflip']:
                    img = img.transpose(Image.FLIP_TOP_BOTTOM)
                
                # Save to JPEG buffer
                buffer = io.BytesIO()
                quality = self._settings['quality']
                img.save(buffer, format='JPEG', quality=quality, optimize=True)
                
                return buffer.getvalue()
                
            except Exception as e:
                logging.error(f"Frame capture failed: {e}")
                return None
    
    def set_setting(self, key: str, value: Any) -> bool:
        """
        Update a camera setting.
        
        @param key: Setting name
        @param value: New value
        @return: True if setting was applied
        """
        with self._lock:
            if key not in self._settings:
                logging.warning(f"Unknown camera setting: {key}")
                return False
            
            self._settings[key] = value
            
            # Apply to camera if awake
            if self._is_awake and self._camera:
                self._apply_single_setting(key, value)
            
            logging.debug(f"Camera setting updated: {key} = {value}")
            return True
    
    def get_settings(self) -> Dict[str, Any]:
        """Get current camera settings."""
        return self._settings.copy()
    
    def reset_settings(self) -> None:
        """Reset all settings to defaults."""
        with self._lock:
            self._settings = self.DEFAULT_SETTINGS.copy()
            if self._is_awake and self._camera:
                self._apply_settings()
            logging.info("Camera settings reset to defaults")
    
    def _get_resolution(self) -> Tuple[int, int]:
        """Get resolution tuple from config."""
        resolution_str = self.config.get('resolution', '1280x720')
        return self.RESOLUTIONS.get(resolution_str, (1280, 720))
    
    def _apply_settings(self):
        """Apply all current settings to the camera."""
        if not self._camera:
            return
        
        try:
            # Apply picamera2/libcamera controls
            controls_dict = {}
            
            # Brightness (as exposure value adjustment)
            brightness = self._settings['brightness']
            if brightness != 0:
                controls_dict['Brightness'] = brightness / 100.0
            
            # Contrast
            contrast = self._settings['contrast']
            if contrast != 0:
                controls_dict['Contrast'] = 1.0 + (contrast / 100.0)
            
            # Saturation
            saturation = self._settings['saturation']
            if saturation != 0:
                controls_dict['Saturation'] = 1.0 + (saturation / 100.0)
            
            # Sharpness
            sharpness = self._settings['sharpness']
            if sharpness != 0:
                controls_dict['Sharpness'] = 1.0 + (sharpness / 100.0)
            
            # Exposure
            exposure = self._settings['exposure']
            if exposure != -6:
                # Map -13 to -1 to libcamera exposure values
                controls_dict['ExposureValue'] = (exposure + 6) / 6.0
            
            # Apply controls if any
            if controls_dict:
                self._camera.set_controls(controls_dict)
                
        except Exception as e:
            logging.warning(f"Error applying camera settings: {e}")
    
    def _apply_single_setting(self, key: str, value: Any):
        """Apply a single setting to the active camera."""
        if not self._camera:
            return
        
        try:
            controls_dict = {}
            
            if key == 'brightness':
                controls_dict['Brightness'] = value / 100.0
            elif key == 'contrast':
                controls_dict['Contrast'] = 1.0 + (value / 100.0)
            elif key == 'saturation':
                controls_dict['Saturation'] = 1.0 + (value / 100.0)
            elif key == 'sharpness':
                controls_dict['Sharpness'] = 1.0 + (value / 100.0)
            elif key == 'exposure':
                controls_dict['ExposureValue'] = (value + 6) / 6.0
            
            if controls_dict:
                self._camera.set_controls(controls_dict)
                
        except Exception as e:
            logging.warning(f"Error applying setting {key}: {e}")


# Simple test when run directly
if __name__ == '__main__':
    logging.basicConfig(level=logging.DEBUG)
    
    config = {
        'resolution': '1280x720',
        'framerate': 15,
        'jpeg_quality': 85,
        'rotation': 180,
        'vflip': True,
        'hflip': False
    }
    
    manager = CameraManager(config)
    
    print("Waking camera...")
    if manager.wake():
        print("Camera awake, capturing test frame...")
        frame = manager.capture_frame()
        if frame:
            print(f"Captured frame: {len(frame)} bytes")
            # Save test image
            with open('/tmp/test_capture.jpg', 'wb') as f:
                f.write(frame)
            print("Test image saved to /tmp/test_capture.jpg")
        
        time.sleep(2)
        print("Putting camera to sleep...")
        manager.sleep()
        print("Test complete")
    else:
        print("Failed to wake camera")
