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
import queue
import logging
import subprocess
import signal
from typing import Optional, Dict, Any, Tuple
from threading import RLock, Lock, Thread, Event


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
        'vflip': 0,
        'framerate': 25,
        # Focus (Camera Module v3 / imx708 autofocus):
        #   'continuous' = AF hunts constantly (bad for a fixed scene),
        #   'auto'       = AF runs once at start then locks,
        #   'manual'     = fixed lens at `lens_position` dioptres
        #                  (0 = infinity, higher = closer; ~10 ≈ 10 cm min focus)
        'focus_mode': 'continuous',
        'lens_position': 10.0,
        # AF scan range for 'auto'/'continuous' modes: normal, macro, full
        # ('full' covers close subjects like a jar through to infinity)
        'autofocus_range': 'normal',
    }
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize camera manager.
        
        @param config: Camera configuration dictionary
        """
        self.config = config
        self._rpicam_process: Optional[subprocess.Popen] = None
        self._ffmpeg_process: Optional[subprocess.Popen] = None
        self._hls_dir = None
        self._is_awake = False
        self._is_initialized = False
        self._lock = RLock()
        self._settings = self.DEFAULT_SETTINGS.copy()
        self._fifo_path = "/tmp/camera_fifo"
        self._rtsp_port = config.get('rtsp_port', 8554)

        # Live MPEG-TS fan-out (low-latency streaming to HTTP clients)
        self._ts_clients = set()
        self._ts_clients_lock = Lock()
        self._broadcast_thread: Optional[Thread] = None
        self._first_chunk_event = Event()
        
        # Apply config overrides
        self._apply_config_settings()

        # Snapshot of config-merged settings, used by reset_settings()
        # (NOT the hardcoded DEFAULT_SETTINGS, which would override config.yaml
        # tuning like 15fps/700kbps and overload the Pi Zero)
        self._initial_settings = self._settings.copy()
        self._initial_resolution = self.config.get('resolution', '1280x720')

        # Debounced stream restart (coalesces bursts of setting changes)
        self._restart_timer: Optional[object] = None

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
                    'exposure', 'iso', 'quality', 'bitrate', 'framerate',
                    'focus_mode', 'lens_position', 'autofocus_range']:
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
        Wake up and start H.264 streaming via rpicam-vid (TCP) + ffmpeg (HLS).
        
        Provides both:
        - TCP raw H.264 on port 8554 (for VLC: tcp://192.168.1.84:8554)
        - HLS on port 8888 (for browsers)
        
        @return: True if camera successfully initialized
        """
        with self._lock:
            if self._is_awake and self._is_initialized:
                return True
            
            try:
                logging.info("Starting H.264 streaming (TCP + HLS)...")
                
                resolution = self._get_resolution()
                width, height = resolution
                framerate = self._settings.get('framerate', 25)
                bitrate = self._settings.get('bitrate', 2000000)
                rotation = self._settings.get('rotation', 0)
                hflip = self._settings.get('hflip', 0)
                vflip = self._settings.get('vflip', 0)
                
                # Create HLS output directory in RAM disk (/tmp/hls is mounted as tmpfs)
                hls_dir = "/tmp/hls"
                os.makedirs(hls_dir, exist_ok=True)
                
                # Build rpicam-vid command - outputs TCP H.264 for VLC compatibility
                rpicam_cmd = [
                    'rpicam-vid',
                    '-t', '0',  # Run indefinitely
                    '--width', str(width),
                    '--height', str(height),
                    '--framerate', str(framerate),
                    '--bitrate', str(bitrate),
                    '--codec', 'h264',
                    '--inline',
                    '--intra', str(framerate),  # Force keyframe (I-frame) every 1 second for fast HLS startup
                    '--listen',  # Listen mode for TCP
                    '-o', f'tcp://0.0.0.0:{self._rtsp_port}',  # TCP output (VLC compatible)
                ]
                
                # Add rotation if needed
                if rotation == 180:
                    rpicam_cmd.extend(['--rotation', '180'])
                elif rotation == 90:
                    rpicam_cmd.extend(['--rotation', '90'])
                elif rotation == 270:
                    rpicam_cmd.extend(['--rotation', '270'])
                
                # Add flips
                if hflip:
                    rpicam_cmd.append('--hflip')
                if vflip:
                    rpicam_cmd.append('--vflip')

                # Image adjustments (UI uses -100..100 scales, rpicam uses
                # -1..1 for brightness and 0..2 around nominal 1.0 for the rest)
                brightness = self._settings.get('brightness', 0)
                contrast = self._settings.get('contrast', 0)
                saturation = self._settings.get('saturation', 0)
                sharpness = self._settings.get('sharpness', 1)
                exposure = self._settings.get('exposure', -6)
                iso = self._settings.get('iso', 100)

                rpicam_cmd.extend(['--brightness', f"{max(-1.0, min(1.0, brightness / 100)):.2f}"])
                rpicam_cmd.extend(['--contrast', f"{max(0.0, 1 + contrast / 100):.2f}"])
                rpicam_cmd.extend(['--saturation', f"{max(0.0, 1 + saturation / 100):.2f}"])
                rpicam_cmd.extend(['--sharpness', f"{max(0.0, 1 + (sharpness - 1) / 100):.2f}"])
                # UI exposure is -13..-1 with -6 as neutral -> EV compensation -7..+5
                rpicam_cmd.extend(['--ev', f"{max(-10, min(10, exposure + 6))}"])
                # ISO 100 = auto gain; above that, fixed gain iso/100
                if iso > 100:
                    rpicam_cmd.extend(['--gain', f"{iso / 100:.1f}"])

                # Focus control (imx708). 'manual' avoids the constant autofocus
                # hunting that blurs a fixed scene; lens_position is in dioptres
                # (0 = infinity, higher = closer subject).
                focus_mode = self._settings.get('focus_mode', 'continuous')
                af_range = self._settings.get('autofocus_range', 'normal')
                if focus_mode == 'continuous':
                    rpicam_cmd.extend(['--autofocus-mode', 'continuous',
                                       '--autofocus-range', str(af_range)])
                elif focus_mode == 'auto':
                    rpicam_cmd.extend(['--autofocus-mode', 'auto',
                                       '--autofocus-range', str(af_range)])
                else:  # manual (fixed focus)
                    lens_position = self._settings.get('lens_position', 0.0)
                    rpicam_cmd.extend([
                        '--autofocus-mode', 'manual',
                        '--lens-position', f"{float(lens_position):.2f}"])

                logging.info(f"Starting rpicam-vid: {' '.join(rpicam_cmd)}")
                
                # Start rpicam-vid process (TCP server)
                self._rpicam_log = open('/tmp/rpicam-vid.log', 'w')
                rpicam_proc = subprocess.Popen(
                    rpicam_cmd,
                    stdout=self._rpicam_log,
                    stderr=self._rpicam_log,
                    preexec_fn=os.setsid
                )
                
                # Wait for rpicam-vid to start listening (up to 20 seconds for Pi Zero)
                logging.info("Waiting for rpicam-vid to initialize and open port (non-destructive check)...")
                port_ready = False
                for i in range(40):
                    time.sleep(0.5)
                    # Check if process is still running
                    if rpicam_proc.poll() is not None:
                        logging.error("rpicam-vid exited during startup")
                        self._rpicam_log.close()
                        self._cleanup_process(rpicam_proc)
                        return False
                    
                    # Non-destructive check: see if port 8554 is in LISTEN state using 'ss'
                    try:
                        import subprocess as sp
                        # ss -H -tln sport = :8554
                        out = sp.check_output(['ss', '-H', '-tln', f'sport = :{self._rtsp_port}']).decode()
                        if len(out.strip()) > 0:
                            port_ready = True
                            break
                    except Exception as e:
                        pass
                
                if not port_ready:
                    logging.error(f"rpicam-vid failed to open port {self._rtsp_port} within timeout")
                    self._rpicam_log.close()
                    self._cleanup_process(rpicam_proc)
                    return False
                
                logging.info(f"rpicam-vid successfully started and listening on port {self._rtsp_port}")
                
                # Build ffmpeg command to read TCP and produce two outputs:
                #  1. HLS (fallback for Safari / no-MSE browsers): 1s segments,
                #     6-segment playlist, segments kept on disk a while after
                #     leaving the playlist so in-flight downloads never 404.
                #  2. MPEG-TS on stdout: fanned out to HTTP clients by the
                #     broadcaster thread for sub-second live playback (mpegts.js).
                # rpicam-vid runs as TCP server with --listen, ffmpeg connects as client
                ffmpeg_cmd = [
                    'ffmpeg',
                    '-fflags', 'nobuffer+discardcorrupt',
                    '-flags', 'low_delay',
                    '-probesize', '32',
                    '-analyzeduration', '0',
                    '-i', f'tcp://127.0.0.1:{self._rtsp_port}',  # Connect to rpicam-vid TCP
                    # Output 1: HLS fallback
                    '-map', '0:v',
                    '-c:v', 'copy',  # Copy video stream (no re-encode)
                    '-f', 'hls',
                    '-hls_time', '1',  # 1 second segments (matches --intra keyframe interval)
                    '-hls_list_size', '6',  # 6 segments in playlist
                    '-hls_delete_threshold', '4',  # Keep 4 extra segments on disk before deleting
                    '-hls_flags', 'delete_segments+omit_endlist+independent_segments',
                    '-hls_allow_cache', '0',
                    f'{hls_dir}/index.m3u8',
                    # Output 2: live MPEG-TS to stdout (PAT/PMT re-emitted every 100ms by default)
                    '-map', '0:v',
                    '-c:v', 'copy',
                    '-f', 'mpegts',
                    '-muxdelay', '0',
                    'pipe:1',
                ]

                logging.info(f"Starting ffmpeg: {' '.join(ffmpeg_cmd)}")

                # Start ffmpeg process
                self._ffmpeg_log = open('/tmp/ffmpeg.log', 'w')
                ffmpeg_proc = subprocess.Popen(
                    ffmpeg_cmd,
                    stdout=subprocess.PIPE,
                    stderr=self._ffmpeg_log,
                    preexec_fn=os.setsid
                )

                # Start MPEG-TS broadcaster thread (reads stdout, fans out to clients)
                self._first_chunk_event = Event()  # Fresh event for this wake cycle
                self._broadcast_thread = Thread(
                    target=self._broadcast_loop, args=(ffmpeg_proc,), daemon=True
                )
                self._broadcast_thread.start()

                # Wait for actual video data before declaring the stream ready.
                # The camera sensor takes 6-10s to produce its first frame on a
                # Pi Zero; clients connecting before that would starve.
                logging.info("Waiting for first video data (camera sensor warmup)...")
                video_ready = False
                for _ in range(50):  # Up to 25 seconds
                    if ffmpeg_proc.poll() is not None:
                        logging.error("ffmpeg exited during startup")
                        self._rpicam_log.close()
                        self._ffmpeg_log.close()
                        self._cleanup_process(rpicam_proc)
                        self._cleanup_process(ffmpeg_proc)
                        return False
                    if self._first_chunk_event.wait(0.5):
                        video_ready = True
                        break

                if not video_ready:
                    logging.warning("No video data after 25s, continuing anyway (HLS may still come up)")
                
                self._rpicam_process = rpicam_proc
                self._ffmpeg_process = ffmpeg_proc
                self._hls_dir = hls_dir
                
                self._is_awake = True
                self._is_initialized = True
                
                logging.info(f"H.264 streaming active - {width}x{height}@{framerate}fps")
                logging.info(f"TCP (VLC): tcp://<pi-ip>:{self._rtsp_port}")
                logging.info(f"HLS (Browser): http://<pi-ip>:8080/hls/index.m3u8")
                return True
                
            except Exception as e:
                logging.error(f"Camera wake failed: {e}")
                self._cleanup_camera()
                return False
    
    def _broadcast_loop(self, proc: subprocess.Popen):
        """
        Read MPEG-TS from ffmpeg stdout and fan out to connected HTTP clients.

        Always drains stdout (even with no clients) so ffmpeg never blocks
        on a full pipe. Chunks fanned out to clients are aligned on the
        188-byte TS packet boundary so a client joining mid-stream always
        starts on a sync byte. Lagging clients (full queue) are
        disconnected and will reconnect on their own.
        """
        TS_PACKET = 188
        stdout = proc.stdout
        carry = b''
        try:
            while True:
                data = stdout.read(8192)
                if not data:
                    break
                carry += data
                aligned_len = len(carry) - (len(carry) % TS_PACKET)
                if aligned_len == 0:
                    continue
                chunk = carry[:aligned_len]
                carry = carry[aligned_len:]
                if not self._first_chunk_event.is_set():
                    self._first_chunk_event.set()  # Signal wake(): video is flowing
                    logging.info("First video data received from ffmpeg")
                with self._ts_clients_lock:
                    for client_q in list(self._ts_clients):
                        try:
                            client_q.put_nowait(chunk)
                        except queue.Full:
                            self._ts_clients.discard(client_q)
                            try:
                                client_q.put_nowait(None)  # Signal end-of-stream
                            except queue.Full:
                                pass
        except Exception as e:
            logging.debug(f"TS broadcaster stopped: {e}")
        finally:
            # Stream ended: release all clients
            with self._ts_clients_lock:
                for client_q in list(self._ts_clients):
                    try:
                        client_q.put_nowait(None)
                    except queue.Full:
                        pass
                self._ts_clients.clear()
            logging.info("TS broadcaster thread exited")

    def add_ts_client(self) -> 'queue.Queue':
        """
        Register a new live MPEG-TS client.

        @return: Queue delivering TS chunks (None = end of stream)
        """
        client_q = queue.Queue(maxsize=128)  # ~1MB / ~10s of buffered stream max
        with self._ts_clients_lock:
            self._ts_clients.add(client_q)
        logging.info(f"TS client connected ({len(self._ts_clients)} active)")
        return client_q

    def remove_ts_client(self, client_q: 'queue.Queue') -> None:
        """Unregister a live MPEG-TS client."""
        with self._ts_clients_lock:
            self._ts_clients.discard(client_q)
        logging.info(f"TS client disconnected ({len(self._ts_clients)} active)")

    def has_ts_clients(self) -> bool:
        """Check if any live MPEG-TS client is connected."""
        with self._ts_clients_lock:
            return len(self._ts_clients) > 0

    def _cleanup_process(self, proc):
        """Clean up a single process."""
        if proc:
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
                proc.wait(timeout=2)
            except:
                try:
                    os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
                except:
                    pass
    
    def sleep(self) -> None:
        """Stop H.264 streaming and release resources."""
        with self._lock:
            if self._restart_timer:
                self._restart_timer.cancel()
                self._restart_timer = None
            if not self._is_awake:
                return
            
            logging.info("Stopping H.264 streaming...")
            self._cleanup_camera()
            self._is_awake = False
            logging.info("Camera sleeping")
    
    def _cleanup_camera(self):
        """Clean up rpicam-vid and ffmpeg processes."""
        # Clean up rpicam-vid process
        if hasattr(self, '_rpicam_process') and self._rpicam_process:
            self._cleanup_process(self._rpicam_process)
            self._rpicam_process = None
        
        # Clean up ffmpeg process
        if hasattr(self, '_ffmpeg_process') and self._ffmpeg_process:
            self._cleanup_process(self._ffmpeg_process)
            self._ffmpeg_process = None

        # Close logs if open
        if hasattr(self, '_rpicam_log') and self._rpicam_log:
            try:
                self._rpicam_log.close()
            except:
                pass
            self._rpicam_log = None
        
        if hasattr(self, '_ffmpeg_log') and self._ffmpeg_log:
            try:
                self._ffmpeg_log.close()
            except:
                pass
            self._ffmpeg_log = None
    
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
    
    # Settings whose change requires an rpicam-vid restart.
    # NOTE: 'quality' is absent on purpose — it only affects JPEG snapshots.
    RESTART_SETTINGS = ['framerate', 'bitrate', 'rotation', 'hflip', 'vflip',
                        'brightness', 'contrast', 'saturation', 'sharpness',
                        'exposure', 'iso',
                        'focus_mode', 'lens_position', 'autofocus_range']

    def _schedule_restart(self, delay: float = 1.5):
        """
        Schedule a debounced stream restart.

        Bursts of setting changes (e.g. dragging a UI slider) coalesce
        into a single restart once changes settle for `delay` seconds.
        """
        from threading import Timer
        if self._restart_timer:
            self._restart_timer.cancel()
        timer = Timer(delay, self._do_restart)
        timer.daemon = True
        self._restart_timer = timer
        timer.start()

    def _do_restart(self):
        """Restart the stream to apply pending setting changes."""
        with self._lock:
            self._restart_timer = None
            if not self._is_awake:
                return
            logging.info("Applying camera settings (stream restart)...")
            self._cleanup_camera()
            self._is_awake = False
            time.sleep(0.5)
            self.wake()

    def set_setting(self, key: str, value: Any) -> bool:
        """
        Update a camera setting.

        Unchanged values are a no-op. Settings affecting the H.264 stream
        trigger a debounced restart (~1.5s after the last change).

        @param key: Setting name
        @param value: New value
        @return: True if setting was applied
        """
        with self._lock:
            if key not in self._settings:
                logging.warning(f"Unknown camera setting: {key}")
                return False

            if self._settings[key] == value:
                return True  # No change, no restart

            self._settings[key] = value

            if self._is_awake and key in self.RESTART_SETTINGS:
                logging.info(f"Setting '{key}' = {value}, scheduling stream restart...")
                self._schedule_restart()

            logging.debug(f"Camera setting updated: {key} = {value}")
            return True

    def set_resolution(self, resolution: str) -> bool:
        """
        Change the stream resolution (e.g. '640x480').

        @param resolution: One of RESOLUTIONS keys
        @return: True if accepted
        """
        with self._lock:
            if resolution not in self.RESOLUTIONS:
                logging.warning(f"Unknown resolution: {resolution}")
                return False
            if self.config.get('resolution') == resolution:
                return True
            self.config['resolution'] = resolution
            if self._is_awake:
                logging.info(f"Resolution = {resolution}, scheduling stream restart...")
                self._schedule_restart()
            return True

    def get_settings(self) -> Dict[str, Any]:
        """Get current camera settings (includes 'framesize' resolution)."""
        settings = self._settings.copy()
        settings['framesize'] = self.config.get('resolution', '1280x720')
        return settings

    def reset_settings(self) -> None:
        """Reset all settings to the config.yaml defaults."""
        with self._lock:
            self._settings = self._initial_settings.copy()
            self.config['resolution'] = self._initial_resolution
            if self._is_awake:
                self._schedule_restart()
            logging.info("Camera settings reset to config defaults")
    
    def _get_resolution(self) -> Tuple[int, int]:
        """Get resolution tuple from config."""
        resolution_str = self.config.get('resolution', '1280x720')
        return self.RESOLUTIONS.get(resolution_str, (1280, 720))
    
    def get_stream_urls(self) -> Dict[str, str]:
        """
        Get stream URLs (TCP for VLC, HLS for browsers).
        
        @return: Dictionary with 'rtsp' (TCP) and 'hls' URLs
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
        
        # HLS and live TS are served via Flask API, not separate HTTP server
        return {
            'rtsp': f"tcp://{ip}:{self._rtsp_port}",  # VLC compatible
            'hls': f"http://{ip}:8080/hls/index.m3u8",  # Via Flask API (fallback)
            'ts': f"http://{ip}:8080/live.ts",  # Low-latency live MPEG-TS
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
