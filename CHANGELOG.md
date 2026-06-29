# Changelog

## [1.2.0] - 2026-06-12

### signalk_pi_pond_video (Pi camera server)

- **[Feature]** BH1750FVI light sensor support (I2C) — lux published to SignalK via MQTT delta (`environment.outside.pond.illuminance`, same `signalk/delta` topic as the ESP32) and exposed as `lux` in the `/` status endpoint; install.sh enables I2C, installs `smbus2`/`paho-mqtt` and detects the sensor
- **[Feature]** Low-latency live MPEG-TS streaming over HTTP (`/live.ts`, ~1s latency) — ffmpeg dual output (HLS + MPEG-TS on stdout) fanned out to HTTP clients with 188-byte TS packet alignment
- **[Feature]** Auto-wake on `/live.ts` connection
- **[Feature]** Camera settings actually applied to the stream — brightness/contrast/saturation/sharpness/EV/gain mapped to rpicam-vid options, resolution change via `framesize`
- **[Bug]** Fix `/wake` returning before the camera produces video — sensor warmup takes 6-10s on Pi Zero; wake now waits for the first real video data, so players no longer connect into a dead stream
- **[Bug]** Fix stream restarting on every settings POST even when values were unchanged (the UI pushed defaults on each wake, causing a ~10s outage right at startup)
- **[Bug]** Debounce settings restarts — slider drags coalesce into one restart 1.5s after the last change
- **[Bug]** Fix settings reset reverting to hardcoded 25fps/2Mbps instead of config.yaml values (overloaded the Pi Zero)
- **[Bug]** Fix HLS stalls — 1s segments (was 2s), 6-segment playlist (was 3), keep 4 extra segments on disk so in-flight downloads never 404
- **[Bug]** Fix auto-sleep cutting the stream mid-watch — HLS segment fetches and live TS clients now count as viewer activity

### signalk-poi-lab (webapp)

- **[Feature]** Light gauge prefers the Pi camera's BH1750 value (`environment.outside.pond.illuminance`) when present, falling back to the ESP32 sensor
- **[Feature]** Near real-time video via mpegts.js (`TS direct` mode, ~1s latency) with automatic HLS fallback for browsers without MSE
- **[Feature]** Tuned hls.js live config — stays 2 segments from the live edge (~2-3s latency)
- **[Feature]** Proxy plugin: TCP no-delay and longer timeouts for streaming/wake routes
- **[Bug]** TS player auto-reconnects when the stream drops (camera restart after a settings change) instead of spinning forever
- **[Bug]** Stop pushing UI default settings to the Pi on wake (caused a stream restart at startup)
- **[Bug]** Fix resolution select sending `NaN` (string values like "640x480" were coerced to Number)
- **[Bug]** Water level: out-of-range/null sensor readings now show N/A on the tile and a normal level in the pond animation (Number(null)===0 made the animation show "Eau 0%")
- **[Bug]** Fix unreachable critical-low water level status (threshold order)

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
