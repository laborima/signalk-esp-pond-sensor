#!/usr/bin/env python3
"""
Camera Test Script for SignalK Pi Pond Video

Quick test to verify camera is working correctly.
Run this before installing the full service.

Usage:
    python3 test_camera.py

@author Matthieu Laborie
"""

import time
import sys

def test_imports():
    """Test that required libraries are available."""
    print("Testing imports...")
    
    try:
        from picamera2 import Picamera2
        print("  picamera2: OK")
    except ImportError as e:
        print(f"  picamera2: FAIL - {e}")
        print("  Install with: sudo apt install python3-picamera2")
        return False
    
    try:
        from flask import Flask
        print("  flask: OK")
    except ImportError as e:
        print(f"  flask: FAIL - {e}")
        print("  Install with: sudo apt install python3-flask")
        return False
    
    try:
        import yaml
        print("  pyyaml: OK")
    except ImportError as e:
        print(f"  pyyaml: FAIL - {e}")
        print("  Install with: sudo apt install python3-yaml")
        return False
    
    try:
        from PIL import Image
        print("  pillow: OK")
    except ImportError as e:
        print(f"  pillow: FAIL - {e}")
        print("  Install with: sudo apt install python3-pil")
        return False
    
    return True


def test_camera_detection():
    """Test that camera is detected."""
    print("\nTesting camera detection...")
    
    try:
        from picamera2 import Picamera2
        
        # Try to get camera info
        cameras = Picamera2.global_camera_info()
        
        if cameras:
            print(f"  Found {len(cameras)} camera(s):")
            for i, cam in enumerate(cameras):
                print(f"    Camera {i}: {cam}")
            return True
        else:
            print("  No cameras found!")
            print("  Check that camera is connected properly")
            print("  Run: sudo raspi-config -> Interface Options -> Camera")
            return False
            
    except Exception as e:
        print(f"  Error detecting camera: {e}")
        return False


def test_capture():
    """Test actual frame capture."""
    print("\nTesting frame capture...")
    
    try:
        from picamera2 import Picamera2
        from PIL import Image
        import io
        
        print("  Initializing camera...")
        camera = Picamera2()
        
        config = camera.create_still_configuration(
            main={"size": (1280, 720)}
        )
        camera.configure(config)
        camera.start()
        
        print("  Camera started, waiting for auto-exposure...")
        time.sleep(1)
        
        print("  Capturing frame...")
        frame = camera.capture_array()
        
        print(f"  Frame captured: {frame.shape}")
        
        # Convert and save
        img = Image.fromarray(frame)
        output_path = "/tmp/test_capture.jpg"
        img.save(output_path, quality=85)
        
        print(f"  Test image saved to: {output_path}")
        
        camera.stop()
        camera.close()
        
        print("  Camera test: SUCCESS")
        return True
        
    except Exception as e:
        print(f"  Capture failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_network():
    """Test network connectivity."""
    print("\nTesting network...")
    
    import socket
    
    try:
        # Get IP address
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        
        print(f"  IP Address: {ip}")
        print(f"  Test URL will be: http://{ip}:8080/")
        
        return True
    except Exception as e:
        print(f"  Network test failed: {e}")
        return False


def main():
    """Run all tests."""
    print("=" * 60)
    print("SignalK Pi Pond Video - Camera Test")
    print("=" * 60)
    
    results = []
    
    # Run tests
    results.append(("Imports", test_imports()))
    results.append(("Camera Detection", test_camera_detection()))
    results.append(("Frame Capture", test_capture()))
    results.append(("Network", test_network()))
    
    # Summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)
    
    all_passed = True
    for name, passed in results:
        status = "PASS" if passed else "FAIL"
        symbol = "✓" if passed else "✗"
        print(f"  {symbol} {name}: {status}")
        if not passed:
            all_passed = False
    
    print("=" * 60)
    
    if all_passed:
        print("\n✓ All tests passed! Ready to install.")
        print("\nRun: ./install.sh")
        return 0
    else:
        print("\n✗ Some tests failed. Please fix issues before installing.")
        print("\nCommon fixes:")
        print("  - Enable camera: sudo raspi-config -> Interface Options -> Camera")
        print("  - Install dependencies: sudo apt install python3-picamera2 python3-flask")
        print("  - Check camera cable connection")
        return 1


if __name__ == "__main__":
    sys.exit(main())
