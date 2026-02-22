/**
 * SignalK ESP Pond Video
 *
 * Firmware for Seeed Studio XIAO ESP32-S3 Sense with OV2640 camera.
 * Camera sleeps by default to save power. Wakes on HTTP request from
 * POI Laboratory dashboard, streams video via WebSocket (low-latency)
 * or MJPEG fallback, then auto-sleeps after a configurable inactivity timeout.
 *
 * Features:
 *   - WiFi power-save ON (MIN_MODEM) when camera sleeping, OFF when streaming
 *   - TCP no-delay + max TX power (19.5dBm) only during active streaming
 *   - Camera OFF by default, starts on /wake or /stream request
 *   - Auto-sleep after CAMERA_SLEEP_TIMEOUT_MS of no active stream
 *   - Night standby mode (refuses wake between configurable hours)
 *   - NTP time sync for standby scheduling
 *   - Hardware watchdog for reliability
 *   - WebSocket JPEG streaming on port WS_PORT (~30ms latency)
 *   - MJPEG streaming on /stream (browser compatibility fallback)
 *   - Camera config page on /config (quality, brightness, contrast, etc.)
 *   - LED status: OFF = sleeping, ON = camera active, blink = streaming
 *
 * Hardware: Seeed Studio XIAO ESP32-S3 Sense
 *   - OV2640 camera module
 *   - 8 MB PSRAM, 8 MB Flash
 *   - Wi-Fi 2.4 GHz 802.11n
 *
 * Dependencies (Arduino Library Manager):
 *   - arduinoWebSockets by Markus Sattler (WebSockets)
 *
 * @author Matthieu Laborie
 */

#include <WiFi.h>
#include <WebServer.h>
#include <WebSocketsServer.h>
#include <time.h>
#include <esp_task_wdt.h>
#include <esp_camera.h>
#include <esp_wifi.h>
#include <esp_pm.h>
#include "config.h"

/* ================= NTP CONFIG ================= */
#define NTP_SERVER   "pool.ntp.org"
#define TZ_PARIS     "CET-1CEST,M3.5.0,M10.5.0/3"

/* ================= WATCHDOG ================= */
#define WDT_TIMEOUT_S 30

/* ================= WIFI RECONNECT ================= */
#define WIFI_CONNECT_TIMEOUT_MS  10000
#define WIFI_RETRY_BASE_MS       1000
#define WIFI_RETRY_MAX_MS        60000
#define WIFI_MAX_FAILURES        10

/* ================= LED (XIAO ESP32-S3) ================= */
#define LED_PIN 21

/* ================= CAMERA PINS (XIAO ESP32-S3 Sense) ================= */
#define PWDN_GPIO_NUM  -1
#define RESET_GPIO_NUM -1
#define XCLK_GPIO_NUM  10
#define SIOD_GPIO_NUM  40
#define SIOC_GPIO_NUM  39

#define Y9_GPIO_NUM    48
#define Y8_GPIO_NUM    11
#define Y7_GPIO_NUM    12
#define Y6_GPIO_NUM    14
#define Y5_GPIO_NUM    16
#define Y4_GPIO_NUM    18
#define Y3_GPIO_NUM    17
#define Y2_GPIO_NUM    15
#define VSYNC_GPIO_NUM 38
#define HREF_GPIO_NUM  47
#define PCLK_GPIO_NUM  13

/* ================= WEBSOCKET ================= */
#define WS_PORT             82
#define WS_MIN_FRAME_MS     20
#define WS_MAX_FRAME_MS     100

/* ================= NETWORK ================= */
WebServer streamServer(STREAM_PORT);
WebSocketsServer wsServer(WS_PORT);

struct MjpegClientArgs
{
    WiFiClient client;
};

/* ================= CAMERA STATE ================= */
bool cameraInitialized = false;
bool cameraAwake = false;
unsigned long lastActivityTime = 0;
int activeStreamClients = 0;

/* ================= WEBSOCKET STATE ================= */
int wsClientCount = 0;
unsigned long lastWsFrame = 0;
bool wsBusy = false;

/* ================= CAMERA RUNTIME CONFIG ================= */
int camBrightness  = CAM_BRIGHTNESS;
int camContrast    = CAM_CONTRAST;
int camSaturation  = CAM_SATURATION;
int camAeLevel     = CAM_AE_LEVEL;
int camGainCeiling = CAM_GAINCEILING;
int camQuality     = JPEG_QUALITY;
int camFrameSize   = FRAME_SIZE;
int camVflip       = 1;
int camHmirror     = 0;
int camDenoise     = 1;

/* ================= WIFI STATE ================= */
unsigned long lastWifiCheck = 0;
unsigned long wifiRetryDelay = WIFI_RETRY_BASE_MS;
int wifiConsecutiveFailures = 0;
bool ntpSynced = false;

enum WifiState {
    WIFI_STATE_IDLE,
    WIFI_STATE_CONNECTING_SSID1,
    WIFI_STATE_CONNECTING_SSID2,
    WIFI_STATE_WAIT_RETRY
};
WifiState wifiState = WIFI_STATE_IDLE;
unsigned long wifiConnectStart = 0;

/* ================= STREAM BOUNDARY ================= */
static const char *STREAM_CONTENT_TYPE = "multipart/x-mixed-replace;boundary=frame";
static const char *STREAM_BOUNDARY = "\r\n--frame\r\n";
static const char *STREAM_PART = "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n";

/* ================= TIME HELPERS ================= */
/**
 * Returns the current local hour (0-23), or -1 if NTP is not yet synced.
 */
int getCurrentHour() {
    struct tm timeinfo;
    if (!getLocalTime(&timeinfo, 0)) return -1;
    return timeinfo.tm_hour;
}

/**
 * Checks whether the camera should refuse wake requests (night mode).
 */
bool isStandbyTime() {
    int hour = getCurrentHour();
    if (hour < 0) return false;
    if (STANDBY_HOUR_START > STANDBY_HOUR_END) {
        return (hour >= STANDBY_HOUR_START || hour < STANDBY_HOUR_END);
    }
    return (hour >= STANDBY_HOUR_START && hour < STANDBY_HOUR_END);
}

/* ================= LED HELPERS ================= */
void ledOn() {
    digitalWrite(LED_PIN, LOW);
}

void ledOff() {
    digitalWrite(LED_PIN, HIGH);
}

void ledBlink(int count, int delayMs) {
    for (int i = 0; i < count; i++) {
        ledOn();
        delay(delayMs);
        ledOff();
        delay(delayMs);
    }
}

/* ================= CAMERA INIT / DEINIT ================= */
/**
 * Applies current runtime camera settings to the OV2640 sensor.
 * Called after init and after any /config change.
 */
void applyCameraSettings() {
    sensor_t *s = esp_camera_sensor_get();
    if (s == NULL) return;

    s->set_brightness(s, camBrightness);
    s->set_contrast(s, camContrast);
    s->set_saturation(s, camSaturation);
    s->set_whitebal(s, 1);
    s->set_awb_gain(s, 1);
    s->set_wb_mode(s, 0);
    s->set_aec2(s, 1);
    s->set_ae_level(s, camAeLevel);
    s->set_gainceiling(s, (gainceiling_t)camGainCeiling);
    s->set_gain_ctrl(s, 1);
    s->set_exposure_ctrl(s, 1);
    s->set_bpc(s, 1);
    s->set_wpc(s, 1);
    s->set_lenc(s, 1);
    s->set_raw_gma(s, 1);
    s->set_dcw(s, 1);
    s->set_denoise(s, camDenoise);
    s->set_vflip(s, camVflip);
    s->set_hmirror(s, camHmirror);
    s->set_quality(s, camQuality);
    s->set_framesize(s, (framesize_t)camFrameSize);

    Serial.println("[CAM] Settings applied");
}

/**
 * Initializes the OV2640 camera with PSRAM-optimized settings.
 *
 * @return true if camera initialized successfully
 */
bool initCamera() {
    if (cameraInitialized) return true;

    camera_config_t config;
    config.ledc_channel = LEDC_CHANNEL_0;
    config.ledc_timer = LEDC_TIMER_0;
    config.pin_d0 = Y2_GPIO_NUM;
    config.pin_d1 = Y3_GPIO_NUM;
    config.pin_d2 = Y4_GPIO_NUM;
    config.pin_d3 = Y5_GPIO_NUM;
    config.pin_d4 = Y6_GPIO_NUM;
    config.pin_d5 = Y7_GPIO_NUM;
    config.pin_d6 = Y8_GPIO_NUM;
    config.pin_d7 = Y9_GPIO_NUM;
    config.pin_xclk = XCLK_GPIO_NUM;
    config.pin_pclk = PCLK_GPIO_NUM;
    config.pin_vsync = VSYNC_GPIO_NUM;
    config.pin_href = HREF_GPIO_NUM;
    config.pin_sccb_sda = SIOD_GPIO_NUM;
    config.pin_sccb_scl = SIOC_GPIO_NUM;
    config.pin_pwdn = PWDN_GPIO_NUM;
    config.pin_reset = RESET_GPIO_NUM;
    config.xclk_freq_hz = 16000000;
    config.pixel_format = PIXFORMAT_JPEG;
    config.grab_mode = CAMERA_GRAB_LATEST;

    if (psramFound()) {
        Serial.println("[CAM] PSRAM detected, using high resolution");
        config.frame_size = FRAME_SIZE;
        config.jpeg_quality = JPEG_QUALITY;
        config.fb_count = 2;
        config.fb_location = CAMERA_FB_IN_PSRAM;
    } else {
        Serial.println("[CAM] No PSRAM, using low resolution");
        config.frame_size = FRAMESIZE_QVGA;
        config.jpeg_quality = 20;
        config.fb_count = 1;
        config.fb_location = CAMERA_FB_IN_DRAM;
    }

    esp_err_t err = esp_camera_init(&config);
    if (err != ESP_OK) {
        Serial.printf("[CAM] Init failed: 0x%x\n", err);
        return false;
    }

    applyCameraSettings();
    cameraInitialized = true;
    Serial.println("[CAM] Initialized successfully");
    return true;
}

/**
 * Deinitializes the camera to free resources and reduce power consumption.
 */
void deinitCamera() {
    if (!cameraInitialized) return;
    esp_camera_deinit();
    cameraInitialized = false;
    Serial.println("[CAM] Deinitialized");
}

/* ================= CAMERA WAKE / SLEEP ================= */
/**
 * Wakes the camera: initializes hardware and marks as active.
 * Disables WiFi power-save for maximum streaming throughput.
 *
 * @return true if camera is now awake and ready
 */
bool wakeCamera() {
    if (cameraAwake && cameraInitialized) {
        lastActivityTime = millis();
        return true;
    }

    if (isStandbyTime()) {
        Serial.println("[CAM] Wake refused: night standby");
        return false;
    }

    Serial.println("[CAM] Waking up...");
    setCpuFrequencyMhz(240);
    esp_wifi_set_ps(WIFI_PS_NONE);
    WiFi.setTxPower(WIFI_POWER_19_5dBm);
    bool ok = initCamera();
    if (ok) {
        cameraAwake = true;
        lastActivityTime = millis();
        ledOn();
        Serial.println("[CAM] Awake and ready – WiFi power-save OFF");
    }
    return ok;
}

/**
 * Puts the camera to sleep: deinitializes hardware to save power.
 * Also re-enables WiFi power-save since we only need to receive /wake requests.
 */
void sleepCamera() {
    if (!cameraAwake) return;
    Serial.println("[CAM] Going to sleep...");
    deinitCamera();
    cameraAwake = false;
    wsClientCount = 0;
    wsBusy = false;
    ledOff();
    esp_wifi_set_ps(WIFI_PS_MIN_MODEM);
    setCpuFrequencyMhz(80);
    Serial.println("[CAM] Sleeping – WiFi power-save ON");
}

/**
 * Refreshes the activity timestamp (called during active streaming).
 */
void touchActivity() {
    lastActivityTime = millis();
}

/* ================= HTTP HANDLERS ================= */
/**
 * Handles the root endpoint. Returns device status as JSON.
 */
void handleRoot() {
    struct tm timeinfo;
    bool hasTime = getLocalTime(&timeinfo, 0);
    char timeBuf[20] = "unknown";
    if (hasTime) {
        snprintf(timeBuf, sizeof(timeBuf), "%02d:%02d:%02d",
                 timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec);
    }

    char json[512];
    snprintf(json, sizeof(json),
        "{\"device\":\"%s\",\"camera_awake\":%s,\"camera_ready\":%s,\"standby\":%s,\"ntp_synced\":%s,"
        "\"local_time\":\"%s\",\"streaming\":%s,\"ws_clients\":%d,\"wifi_rssi\":%d,\"uptime\":%lu,"
        "\"psram\":%s,\"free_heap\":%u,\"stream_url\":\"http://%s:%d/stream\",\"ws_url\":\"ws://%s:%d/\"}",
        DEVICE_NAME,
        cameraAwake ? "true" : "false",
        cameraInitialized ? "true" : "false",
        isStandbyTime() ? "true" : "false",
        ntpSynced ? "true" : "false",
        timeBuf,
        activeStreamClients > 0 ? "true" : "false",
        wsClientCount,
        WiFi.RSSI(),
        millis() / 1000,
        psramFound() ? "true" : "false",
        ESP.getFreeHeap(),
        WiFi.localIP().toString().c_str(), STREAM_PORT,
        WiFi.localIP().toString().c_str(), WS_PORT
    );

    streamServer.sendHeader("Access-Control-Allow-Origin", "*");
    streamServer.send(200, "application/json", json);
}

/**
 * Handles the /wake endpoint. Wakes the camera on demand.
 */
void handleWake() {
    streamServer.sendHeader("Access-Control-Allow-Origin", "*");

    if (isStandbyTime()) {
        streamServer.send(503, "application/json",
            "{\"status\":\"standby\",\"message\":\"Night mode active\"}");
        return;
    }

    bool ok = wakeCamera();
    if (ok) {
        String resp = "{\"status\":\"awake\",";
        resp += "\"stream_url\":\"http://" + WiFi.localIP().toString() + ":" + String(STREAM_PORT) + "/stream\",";
        resp += "\"ws_url\":\"ws://" + WiFi.localIP().toString() + ":" + String(WS_PORT) + "/\"";
        resp += "}";
        streamServer.send(200, "application/json", resp);
    } else {
        streamServer.send(500, "application/json",
            "{\"status\":\"error\",\"message\":\"Camera init failed\"}");
    }
}

/**
 * Handles the /sleep endpoint. Puts the camera to sleep.
 */
void handleSleep() {
    sleepCamera();
    streamServer.sendHeader("Access-Control-Allow-Origin", "*");
    streamServer.send(200, "application/json", "{\"status\":\"sleeping\"}");
}

/**
 * FreeRTOS task: streams MJPEG frames to a single client.
 * Runs independently so the WebServer remains free for other requests.
 *
 * @param pvParameters Pointer to a heap-allocated MjpegClientArgs (freed here)
 */
void mjpegStreamTask(void *pvParameters)
{
    MjpegClientArgs *args = static_cast<MjpegClientArgs *>(pvParameters);
    WiFiClient client = args->client;
    client.setTimeout(2); // 2 seconds timeout for writes to prevent watchdog trigger on slow clients
    delete args;

    activeStreamClients++;
    touchActivity();
    Serial.printf("[STREAM] Task started (%d active)\n", activeStreamClients);

    bool firstFrame = true;
    while (client.connected()) {
        esp_task_wdt_reset();
        touchActivity();

        if (!cameraAwake || !cameraInitialized) {
            delay(100);
            continue;
        }

        camera_fb_t *fb = esp_camera_fb_get();
        if (!fb) {
            delay(100);
            continue;
        }

        if (firstFrame) {
            Serial.printf("[STREAM] First frame: %dx%d, %u bytes\n",
                          fb->width, fb->height, fb->len);
            firstFrame = false;
        }

        char headerBuf[128];
        size_t headerLen = snprintf(headerBuf, sizeof(headerBuf), 
            "%sContent-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n", 
            STREAM_BOUNDARY, fb->len);

        client.write((const uint8_t*)headerBuf, headerLen);
        client.write(fb->buf, fb->len);

        esp_camera_fb_return(fb);
    }

    activeStreamClients--;
    Serial.printf("[STREAM] Task ended (%d remaining)\n", activeStreamClients);
    touchActivity();
    vTaskDelete(NULL);
}

void handleStream() {
    if (isStandbyTime()) {
        streamServer.send(503, "text/plain", "Night standby active");
        return;
    }

    if (!cameraAwake) {
        bool ok = wakeCamera();
        if (!ok) {
            streamServer.send(503, "text/plain", "Camera wake failed");
            return;
        }
        delay(200);
    }

    WiFiClient client = streamServer.client();
    client.setNoDelay(true);
    client.println("HTTP/1.1 200 OK");
    client.println("Content-Type: " + String(STREAM_CONTENT_TYPE));
    client.println("Access-Control-Allow-Origin: *");
    client.println("Cache-Control: no-cache, no-store, must-revalidate");
    client.println("Connection: close");
    client.println();

    activeStreamClients++;
    MjpegClientArgs *args = new MjpegClientArgs{client};
    BaseType_t ret = xTaskCreatePinnedToCore(
        mjpegStreamTask,
        "mjpeg_stream",
        8192,
        args,
        1,
        NULL,
        0
    );
    if (ret != pdPASS) {
        Serial.println("[STREAM] Failed to create task");
        delete args;
        activeStreamClients--;
    }
}

/**
 * Handles single JPEG capture endpoint. Auto-wakes if needed.
 */
void handleCapture() {
    if (isStandbyTime()) {
        streamServer.send(503, "text/plain", "Night standby active");
        return;
    }

    if (!cameraAwake) {
        bool ok = wakeCamera();
        if (!ok) {
            streamServer.send(503, "text/plain", "Camera wake failed");
            return;
        }
        delay(200);
    }

    touchActivity();

    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) {
        streamServer.send(500, "text/plain", "Capture failed");
        return;
    }

    streamServer.sendHeader("Access-Control-Allow-Origin", "*");
    streamServer.sendHeader("Cache-Control", "no-cache");
    streamServer.send_P(200, "image/jpeg", (const char *)fb->buf, fb->len);
    esp_camera_fb_return(fb);
}

/**
 * Handles CORS preflight requests.
 */
void handleCors() {
    streamServer.sendHeader("Access-Control-Allow-Origin", "*");
    streamServer.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    streamServer.sendHeader("Access-Control-Allow-Headers", "Content-Type");
    streamServer.send(204);
}

/**
 * GET /config – returns current camera settings as JSON.
 * POST /config – applies new settings from query params or JSON body.
 *
 * Supported params: brightness, contrast, saturation, ae_level,
 *                   gainceiling, quality, framesize, vflip, hmirror, denoise
 */
void handleConfig() {
    streamServer.sendHeader("Access-Control-Allow-Origin", "*");

    if (streamServer.method() == HTTP_POST) {
        if (streamServer.hasArg("reset")) {
            camBrightness  = CAM_BRIGHTNESS;
            camContrast    = CAM_CONTRAST;
            camSaturation  = CAM_SATURATION;
            camAeLevel     = CAM_AE_LEVEL;
            camGainCeiling = CAM_GAINCEILING;
            camQuality     = JPEG_QUALITY;
            camFrameSize   = FRAME_SIZE;
            camVflip       = 1;
            camHmirror     = 0;
            camDenoise     = 1;
            if (cameraInitialized) applyCameraSettings();
            Serial.println("[CONFIG] Reset to defaults");
        } else {
            bool changed = false;

            auto applyInt = [&](const char *name, int &target, int minVal, int maxVal) {
                if (streamServer.hasArg(name)) {
                    int v = streamServer.arg(name).toInt();
                    if (v >= minVal && v <= maxVal) {
                        target = v;
                        changed = true;
                    }
                }
            };

            applyInt("brightness",  camBrightness,  -2, 2);
            applyInt("contrast",    camContrast,    -2, 2);
            applyInt("saturation",  camSaturation,  -2, 2);
            applyInt("ae_level",    camAeLevel,     -2, 2);
            applyInt("gainceiling", camGainCeiling,  0, 6);
            applyInt("quality",     camQuality,      4, 63);
            applyInt("framesize",   camFrameSize,    0, 13);
            applyInt("vflip",       camVflip,        0, 1);
            applyInt("hmirror",     camHmirror,      0, 1);
            applyInt("denoise",     camDenoise,      0, 1);

            if (changed && cameraInitialized) {
                applyCameraSettings();
            }
        }
    }

    char json[256];
    snprintf(json, sizeof(json),
        "{\"brightness\":%d,\"contrast\":%d,\"saturation\":%d,\"ae_level\":%d,\"gainceiling\":%d,"
        "\"quality\":%d,\"framesize\":%d,\"vflip\":%d,\"hmirror\":%d,\"denoise\":%d}",
        camBrightness, camContrast, camSaturation, camAeLevel, camGainCeiling,
        camQuality, camFrameSize, camVflip, camHmirror, camDenoise
    );

    streamServer.send(200, "application/json", json);
}

/* ================= WEBSOCKET STREAMING ================= */
/**
 * WebSocket event handler.
 * Tracks connected clients; streaming is driven from the loop task.
 *
 * @param num    Client number
 * @param type   Event type
 * @param payload Event payload
 * @param length  Payload length
 */
void onWsEvent(uint8_t num, WStype_t type, uint8_t *payload, size_t length) {
    switch (type) {
        case WStype_CONNECTED:
            wsClientCount++;
            touchActivity();
            Serial.printf("[WS] Client #%d connected (%d total)\n", num, wsClientCount);
            if (!cameraAwake) {
                wakeCamera();
            }
            break;
        case WStype_DISCONNECTED:
            if (wsClientCount > 0) wsClientCount--;
            Serial.printf("[WS] Client #%d disconnected (%d remaining)\n", num, wsClientCount);
            touchActivity();
            break;
        default:
            break;
    }
}

/**
 * Broadcasts one JPEG frame to all connected WebSocket clients.
 * Uses adaptive timing: waits at least WS_MIN_FRAME_MS between frames,
 * and skips if the previous broadcast took longer than WS_MAX_FRAME_MS
 * (network congestion). This prevents frame queue buildup.
 */
void wsBroadcastFrame() {
    if (wsClientCount == 0) return;
    if (!cameraAwake || !cameraInitialized) return;

    unsigned long now = millis();
    if (now - lastWsFrame < WS_MIN_FRAME_MS) return;

    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) return;

    unsigned long t0 = millis();
    wsServer.broadcastBIN(fb->buf, fb->len);
    unsigned long elapsed = millis() - t0;
    size_t frameLen = fb->len;

    esp_camera_fb_return(fb);
    touchActivity();

    lastWsFrame = millis();

    if (elapsed > WS_MAX_FRAME_MS) {
        Serial.printf("[WS] Slow broadcast: %lu ms (%u bytes)\n", elapsed, frameLen);
    }
}

/* ================= WIFI ================= */
/**
 * Non-blocking WiFi reconnection state machine.
 */
void handleWifi() {
    if (WiFi.status() == WL_CONNECTED) {
        if (wifiState != WIFI_STATE_IDLE) {
            Serial.printf("[WIFI] Connected – IP: %s\n", WiFi.localIP().toString().c_str());
            wifiState = WIFI_STATE_IDLE;
            wifiRetryDelay = WIFI_RETRY_BASE_MS;
            wifiConsecutiveFailures = 0;
            ntpSynced = false;
            if (cameraAwake) {
                esp_wifi_set_ps(WIFI_PS_NONE);
                WiFi.setTxPower(WIFI_POWER_19_5dBm);
            } else {
                esp_wifi_set_ps(WIFI_PS_MIN_MODEM);
            }
            ledBlink(3, 100);
        }

        if (!ntpSynced) {
            configTzTime(TZ_PARIS, NTP_SERVER);
            struct tm timeinfo;
            if (getLocalTime(&timeinfo, 0)) { // non-blocking check
                ntpSynced = true;
                Serial.println("[NTP] Time synced");
            }
        }
        return;
    }

    unsigned long now = millis();

    switch (wifiState) {
        case WIFI_STATE_IDLE:
        case WIFI_STATE_WAIT_RETRY:
            if (now - lastWifiCheck >= wifiRetryDelay) {
                wifiConsecutiveFailures++;
                Serial.printf("[WIFI] Disconnected – attempt %d\n", wifiConsecutiveFailures);

                if (wifiConsecutiveFailures >= WIFI_MAX_FAILURES) {
                    Serial.println("[WIFI] Too many failures – rebooting ESP32");
                    ESP.restart();
                }

                if (wifiConsecutiveFailures % 3 == 0) {
                    Serial.println("[WIFI] Full reset cycle");
                    WiFi.disconnect(true);
                    WiFi.mode(WIFI_STA);
                }

                Serial.printf("[WIFI] Trying %s...\n", WIFI_SSID);
                WiFi.begin(WIFI_SSID, WIFI_PASS);
                wifiConnectStart = now;
                wifiState = WIFI_STATE_CONNECTING_SSID1;
            }
            break;

        case WIFI_STATE_CONNECTING_SSID1:
            if (now - wifiConnectStart >= WIFI_CONNECT_TIMEOUT_MS) {
                Serial.printf("[WIFI] Failed to connect to %s\n", WIFI_SSID);
                Serial.printf("[WIFI] Trying %s...\n", WIFI_SSID2);
                WiFi.disconnect(true);
                WiFi.begin(WIFI_SSID2, WIFI_PASS2);
                wifiConnectStart = now;
                wifiState = WIFI_STATE_CONNECTING_SSID2;
            }
            break;

        case WIFI_STATE_CONNECTING_SSID2:
            if (now - wifiConnectStart >= WIFI_CONNECT_TIMEOUT_MS) {
                Serial.printf("[WIFI] Failed to connect to %s\n", WIFI_SSID2);
                WiFi.disconnect(true);
                wifiRetryDelay = min(wifiRetryDelay * 2, (unsigned long)WIFI_RETRY_MAX_MS);
                lastWifiCheck = now;
                wifiState = WIFI_STATE_WAIT_RETRY;
                Serial.printf("[WIFI] Still disconnected, next retry in %lu ms\n", wifiRetryDelay);
            }
            break;
    }
}

/* ================= AUTO-SLEEP ================= */
/**
 * Puts the camera to sleep if no activity for CAMERA_SLEEP_TIMEOUT_MS.
 * Counts both MJPEG clients and WebSocket clients.
 */
void handleAutoSleep() {
    if (!cameraAwake) return;
    if (activeStreamClients > 0 || wsClientCount > 0) return;

    if (millis() - lastActivityTime >= CAMERA_SLEEP_TIMEOUT_MS) {
        Serial.println("[SLEEP] Inactivity timeout reached");
        sleepCamera();
    }
}

/* ================= SETUP ================= */
void setup() {
    Serial.begin(115200);
    Serial.println("[BOOT] XIAO ESP32-S3 Sense starting");
    Serial.printf("[BOOT] PSRAM: %s (%d bytes)\n",
                  psramFound() ? "YES" : "NO",
                  psramFound() ? ESP.getPsramSize() : 0);

    pinMode(LED_PIN, OUTPUT);
    ledOff();

    esp_task_wdt_config_t wdtConfig = {
        .timeout_ms = WDT_TIMEOUT_S * 1000,
        .idle_core_mask = 0,
        .trigger_panic = true
    };
    if (esp_task_wdt_reconfigure(&wdtConfig) != ESP_OK) {
        esp_task_wdt_init(&wdtConfig);
    }
    esp_task_wdt_add(NULL);
    Serial.println("[WDT] Watchdog enabled");

    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(false);

    // Initial wifi connect is now handled by the state machine in loop()
    wifiState = WIFI_STATE_WAIT_RETRY;
    wifiRetryDelay = 0; // Trigger immediately
    lastWifiCheck = millis();

    streamServer.on("/", HTTP_GET, handleRoot);
    streamServer.on("/wake", HTTP_GET, handleWake);
    streamServer.on("/wake", HTTP_POST, handleWake);
    streamServer.on("/sleep", HTTP_GET, handleSleep);
    streamServer.on("/sleep", HTTP_POST, handleSleep);
    streamServer.on("/stream", HTTP_GET, handleStream);
    streamServer.on("/capture", HTTP_GET, handleCapture);
    streamServer.on("/config", HTTP_GET, handleConfig);
    streamServer.on("/config", HTTP_POST, handleConfig);
    streamServer.on("/", HTTP_OPTIONS, handleCors);
    streamServer.on("/wake", HTTP_OPTIONS, handleCors);
    streamServer.on("/sleep", HTTP_OPTIONS, handleCors);
    streamServer.on("/stream", HTTP_OPTIONS, handleCors);
    streamServer.on("/capture", HTTP_OPTIONS, handleCors);
    streamServer.on("/config", HTTP_OPTIONS, handleCors);
    streamServer.begin();
    Serial.printf("[HTTP] Server started on port %d\n", STREAM_PORT);

    wsServer.begin();
    wsServer.onEvent(onWsEvent);
    Serial.printf("[WS] WebSocket server started on port %d\n", WS_PORT);

    ledOff();
    Serial.println("[BOOT] Setup complete – camera OFF, awaiting wake request");
}

/* ================= LOOP ================= */
void loop() {
    esp_task_wdt_reset();
    handleWifi();
    handleAutoSleep();
    streamServer.handleClient();
    wsServer.loop();
    wsBroadcastFrame();
    if (!cameraAwake) {
        delay(10);
    } else if (wsClientCount == 0 && activeStreamClients == 0) {
        delay(2);
    } else {
        delay(1); // Yield CPU when awake and streaming
    }
}
