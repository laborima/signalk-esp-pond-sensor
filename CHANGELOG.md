# Changelog

## [1.1.0] - 2025-02-09

### signalk_esp_pond_sensor (firmware)

- **[Bug]** Fix water level sensor returning 0 — keep previous valid reading on failed ultrasonic measurement
- **[Bug]** Fix TFT screen orientation — flip horizontally (rotation 1 -> 3)
- **[Feature]** Increase ultrasonic sensor reliability — timeout 30ms -> 60ms, trigger delay 2us -> 5us

### signalk-poi-lab (webapp)

- **[Feature]** Pond advisor service — fish, aquatic plants, aquaponics crop recommendations
- **[Feature]** Health score — overall ecosystem assessment
- **[Feature]** Derived data — estimated dissolved O2, dew point, algae risk
- **[Feature]** Animated fish, water waves, bubbles
- **[Feature]** PWA support with manifest and service worker
- **[Bug]** Fix data flickering — remove WebSocket, use REST polling only (60s)
- **[Bug]** Fix GaugeCard animation — initialize to null, set first value directly
- **[Bug]** Fix plant luminosity evaluation — skip light check for aquatic/potager plants
- **[Cleanup]** Remove debug mode and mock data from production
- **[Cleanup]** White-background logo for SignalK (no transparency)
- **[Cleanup]** Remove unused mockData.js and root manifest.json

### Repository

- **[Setup]** Restructure into signalk_esp_pond_sensor/ and signalk-poi-lab/ subdirectories
- **[Setup]** Add .gitignore — config.h, node_modules, .next, .env
- **[Setup]** Add bilingual READMEs (EN/FR) with badges
- **[Setup]** Add CHANGELOG
- **[Cleanup]** Remove hardcoded IPs from documentation

## [1.0.0] - 2025-01-20

### signalk_esp_pond_sensor (firmware)

- **[Feature]** Initial release — ESP32 pond monitoring sensor
- **[Feature]** DS18B20 x2 water temperature probes
- **[Feature]** pH and EC analog sensors
- **[Feature]** HC-SR04 ultrasonic water level sensor
- **[Feature]** BH1750 illuminance sensor
- **[Feature]** BME280/BMP280 air temperature and pressure
- **[Feature]** TFT display (ST7789 135x240) with color-coded bars
- **[Feature]** MQTT publishing to SignalK
- **[Feature]** Night standby mode (20h-7h)
- **[Feature]** Watchdog timer (30s)
- **[Setup]** config.h.sample for WiFi/MQTT credentials
