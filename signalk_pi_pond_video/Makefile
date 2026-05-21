# Makefile for SignalK Pi Pond Video
# Raspberry Pi Zero WH with Camera Module v3

.PHONY: help install test start stop restart status logs clean

# Default target
help:
	@echo "SignalK Pi Pond Video - Makefile"
	@echo ""
	@echo "Available targets:"
	@echo "  install    - Install the service on Raspberry Pi"
	@echo "  test         - Test camera and dependencies"
	@echo "  start        - Start the systemd service"
	@echo "  stop         - Stop the systemd service"
	@echo "  restart      - Restart the systemd service"
	@echo "  status       - Check service status"
	@echo "  logs         - View service logs (follow mode)"
	@echo "  config       - Edit configuration file"
	@echo "  uninstall    - Remove the service"
	@echo "  clean        - Clean up temporary files"
	@echo "  package      - Create distribution package"

# Installation
install:
	@echo "Installing SignalK Pi Pond Video..."
	chmod +x install.sh
	./install.sh

# Test camera and dependencies
test:
	@echo "Testing camera and dependencies..."
	python3 test_camera.py

# Service management
start:
	sudo systemctl start signalk-pi-pond-video

stop:
	sudo systemctl stop signalk-pi-pond-video

restart:
	sudo systemctl restart signalk-pi-pond-video

status:
	sudo systemctl status signalk-pi-pond-video

logs:
	sudo journalctl -u signalk-pi-pond-video -f

# Configuration
config:
	sudo nano /opt/signalk_pi_pond_video/config.yaml

# Uninstallation
uninstall:
	@echo "Uninstalling SignalK Pi Pond Video..."
	sudo systemctl stop signalk-pi-pond-video || true
	sudo systemctl disable signalk-pi-pond-video || true
	sudo rm -f /etc/systemd/system/signalk-pi-pond-video.service
	sudo rm -f /etc/logrotate.d/signalk-pi-pond-video
	sudo rm -rf /opt/signalk_pi_pond_video
	sudo systemctl daemon-reload
	@echo "Uninstall complete."

# Cleanup
clean:
	@echo "Cleaning up..."
	rm -f *.pyc
	rm -rf __pycache__
	rm -f /tmp/test_capture.jpg
	rm -rf build dist *.egg-info

# Create distribution package
package: clean
	@echo "Creating distribution package..."
	mkdir -p dist/signalk_pi_pond_video
	cp -r *.py *.yaml *.sh *.md *.service Makefile .gitignore dist/signalk_pi_pond_video/
	tar -czf dist/signalk_pi_pond_video.tar.gz -C dist signalk_pi_pond_video
	@echo "Package created: dist/signalk_pi_pond_video.tar.gz"

# Development - run locally (for testing)
dev:
	@echo "Starting in development mode..."
	python3 main.py

# Quick test endpoints
check:
	@echo "Checking service endpoints..."
	@IP=$$(hostname -I | awk '{print $$1}'); \
	echo "Device: http://$$IP:8080/"; \
	curl -s http://$$IP:8080/ | python3 -m json.tool || echo "Service not responding"
