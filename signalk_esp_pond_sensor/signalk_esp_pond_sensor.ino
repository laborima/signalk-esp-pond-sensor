#include <WiFi.h>
#include <PubSubClient.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Wire.h>
#include <BH1750.h>
#include <Adafruit_BME280.h>
#include <Adafruit_BMP280.h>
#include <time.h>
#include <esp_task_wdt.h>
#include "config.h"

/* ================= STANDBY CONFIG ================= */
#define STANDBY_HOUR_START 20
#define STANDBY_HOUR_END    7

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

/* ================= COLORS ================= */
#define ST77XX_NAVY      0x000F
#define ST77XX_DARKGREY  0x7BEF
#define ST77XX_LIGHTGREY 0xC618
#define ST77XX_LIGHTBLUE 0x5D9F
#define ST77XX_GOLD      0xFEA0

/* ================= TFT (TTGO T-Display) ================= */
#define TFT_MOSI  19
#define TFT_SCLK  18
#define TFT_CS    5
#define TFT_DC    16
#define TFT_RST   23
#define TFT_BL    4

Adafruit_ST7789 tft = Adafruit_ST7789(TFT_CS, TFT_DC, TFT_MOSI, TFT_SCLK, TFT_RST);

/* ================= DS18B20 ================= */
#define ONEWIRE_PIN 27
OneWire oneWire(ONEWIRE_PIN);
DallasTemperature sensors(&oneWire);

/* ================= ULTRASON ================= */
#define TRIG_PIN 25
#define ECHO_PIN 26

/* ================= ANALOG ================= */
#define PH_PIN 33
#define EC_PIN 32

/* ================= I2C ================= */
BH1750 lightMeter;
Adafruit_BME280 bme;
Adafruit_BMP280 bmp;
bool bmeDetected = false;
bool bmpDetected = false;
bool bh1750Detected = false;

/* ================= NETWORK ================= */
WiFiClient espClient;
PubSubClient mqtt(espClient);

/* ================= TIMERS ================= */
unsigned long lastScreen = 0;
unsigned long lastMqtt   = 0;
unsigned long lastSensor = 0;
unsigned long lastWifiCheck = 0;
unsigned long lastMqttRetry = 0;

/* ================= WIFI / RECONNECT STATE ================= */
unsigned long wifiRetryDelay = WIFI_RETRY_BASE_MS;
int wifiConsecutiveFailures = 0;
bool screenOn = true;
bool ntpSynced = false;

/* ================= SENSOR DATA (cached) ================= */
float g_t1 = 0, g_t2 = 0, g_tAvg = 0;
float g_ph = 0, g_ec = 0, g_lux = 0, g_lvl = 0;
float g_airC = 0, g_pressPa = 0;

/* ================= ANIMATION ================= */
struct Bubble {
  float x, y;
  float oldX, oldY;
  float speed;
  int radius;
};
Bubble bubbles[3];

void initBubbles() {
  for (int i = 0; i < 3; i++) {
    bubbles[i].x = 190 + random(-15, 15);
    bubbles[i].y = 115 + random(0, 10);
    bubbles[i].oldX = bubbles[i].x;
    bubbles[i].oldY = bubbles[i].y;
    bubbles[i].speed = 0.5 + random(0, 5) / 10.0;
    bubbles[i].radius = 2;
  }
}

void animateBubbles() {
  for (int i = 0; i < 3; i++) {
    // Effacer ancienne position
    tft.fillCircle((int)bubbles[i].oldX, (int)bubbles[i].oldY, bubbles[i].radius + 1, ST77XX_NAVY);
    
    // Sauvegarder position actuelle
    bubbles[i].oldX = bubbles[i].x;
    bubbles[i].oldY = bubbles[i].y;
    
    // Nouvelle position
    bubbles[i].y -= bubbles[i].speed;
    bubbles[i].x += (random(0, 3) - 1) * 0.3;
    
    // Reset si hors zone
    if (bubbles[i].y < 85) {
      bubbles[i].y = 120;
      bubbles[i].x = 190 + random(-15, 15);
    }
    
    // Dessiner nouvelle position
    tft.drawCircle((int)bubbles[i].x, (int)bubbles[i].y, bubbles[i].radius, ST77XX_LIGHTBLUE);
  }
}

/* ================= UTILS ================= */
float toKelvin(float c) { return c + 273.15f; }

uint16_t colorByRange(float v, float min, float max) {
  if (isnan(v)) return ST77XX_RED;
  if (v < min || v > max) return ST77XX_RED;
  if (v < min + (max-min)*0.2 || v > max - (max-min)*0.2) return ST77XX_ORANGE;
  return ST77XX_GREEN;
}

float readUltrasonCm() {
  digitalWrite(TRIG_PIN, LOW); delayMicroseconds(5);
  digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long d = pulseIn(ECHO_PIN, HIGH, 60000);
  return d > 0 ? d * 0.034f / 2.0f : NAN;
}

float safeDS18B20(uint8_t idx) {
    float t = sensors.getTempCByIndex(idx);
    if (t == DEVICE_DISCONNECTED_C || t < -40 || t > 125) return 0.0f;
    return t;
}

float safeAnalog(int pin, float scale) {
    int v = analogRead(pin);
    if (v <= 0) return 0.0f;
    return v / 4095.0f * scale;
}

float safeUltrason() {
    float lvl = readUltrasonCm();
    if (isnan(lvl)) return g_lvl;
    return lvl;
}

/* ================= DRAW ================= */
void drawBar(int x, int y, int w, float v, float min, float max, uint16_t bg=ST77XX_DARKGREY) {
  tft.fillRect(x, y, w, 8, bg);
  if (!isnan(v)) {
    int bw = constrain((int)((v - min) * (w-2) / (max - min)), 0, w-2);
    tft.fillRect(x+1, y+1, bw, 6, colorByRange(v, min, max));
  }
}

uint16_t globalFishColor(float t, float ph, float ec) {
  // Bassin extérieur: température acceptable de 8°C à 30°C (hiver à été)
  if (t < 8 || t > 30 || ph < 6.0 || ph > 8.0 || ec < 200 || ec > 2000)
    return ST77XX_RED;
  if (t < 10 || t > 28 || ph < 6.4 || ph > 7.5)
    return ST77XX_ORANGE;
  return ST77XX_GREEN;
}

void drawFish(int x, int y, uint16_t bodyColor) {
  // Corps principal (ovale)
  tft.fillCircle(x, y, 12, bodyColor);
  tft.fillCircle(x-6, y, 10, bodyColor);
  tft.fillCircle(x+6, y, 10, bodyColor);
  
  // Queue en éventail
  tft.fillTriangle(x-18, y, x-28, y-10, x-28, y+10, bodyColor);
  tft.fillTriangle(x-20, y-3, x-30, y-12, x-26, y-8, bodyColor);
  tft.fillTriangle(x-20, y+3, x-30, y+12, x-26, y+8, bodyColor);
  
  // Nageoires
  tft.fillTriangle(x-2, y-8, x-6, y-14, x+2, y-10, bodyColor);
  tft.fillTriangle(x-2, y+8, x-6, y+14, x+2, y+10, bodyColor);
  
  // Œil blanc
  tft.fillCircle(x+4, y-4, 4, ST77XX_WHITE);
  // Pupille
  tft.fillCircle(x+5, y-4, 2, ST77XX_BLACK);
  // Reflet dans l'œil
  tft.drawPixel(x+6, y-5, ST77XX_WHITE);
  
  // Bouche
  tft.drawLine(x+10, y+2, x+12, y+3, ST77XX_BLACK);
  
  // Écailles (détails)
  uint16_t scaleColor = (bodyColor == ST77XX_ORANGE || bodyColor == ST77XX_RED) ? 
                        ST77XX_GOLD : ST77XX_LIGHTBLUE;
  tft.drawCircle(x-4, y-2, 3, scaleColor);
  tft.drawCircle(x+2, y, 3, scaleColor);
  tft.drawCircle(x-4, y+2, 3, scaleColor);
}

void drawBubbles() {
  for (int i = 0; i < 5; i++) {
    // Bulle avec effet de transparence (cercle double)
    tft.drawCircle((int)bubbles[i].x, (int)bubbles[i].y, bubbles[i].radius, ST77XX_LIGHTBLUE);
    tft.drawPixel((int)bubbles[i].x - 1, (int)bubbles[i].y - 1, ST77XX_WHITE);
  }
}

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
 * Checks whether the display should be in standby mode.
 * Standby is active between STANDBY_HOUR_START and STANDBY_HOUR_END.
 */
bool isStandbyTime() {
  int hour = getCurrentHour();
  if (hour < 0) return false;
  return (hour >= STANDBY_HOUR_START || hour < STANDBY_HOUR_END);
}

/* ================= SCREEN POWER ================= */
void setScreenPower(bool on) {
  if (on == screenOn) return;
  screenOn = on;
  if (on) {
    digitalWrite(TFT_BL, HIGH);
    drawStaticBackground();
    Serial.println("[SCREEN] Waking up");
  } else {
    tft.fillScreen(ST77XX_BLACK);
    digitalWrite(TFT_BL, LOW);
    Serial.println("[SCREEN] Entering standby");
  }
}

/* ================= WIFI / MQTT ================= */
/**
 * Robust WiFi reconnection with exponential backoff.
 * Performs a full disconnect/reconnect cycle after repeated failures.
 * Resets the ESP32 as a last resort after WIFI_MAX_FAILURES consecutive failures.
 */
void handleWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    wifiRetryDelay = WIFI_RETRY_BASE_MS;
    wifiConsecutiveFailures = 0;
    if (!ntpSynced) {
      configTzTime(TZ_PARIS, NTP_SERVER);
      struct tm timeinfo;
      if (getLocalTime(&timeinfo, 5000)) {
        ntpSynced = true;
        Serial.println("[NTP] Time synced");
      }
    }
    return;
  }

  if (millis() - lastWifiCheck < wifiRetryDelay) return;
  lastWifiCheck = millis();

  wifiConsecutiveFailures++;
  Serial.printf("[WIFI] Disconnected – attempt %d (backoff %lu ms)\n",
                wifiConsecutiveFailures, wifiRetryDelay);

  if (wifiConsecutiveFailures >= WIFI_MAX_FAILURES) {
    Serial.println("[WIFI] Too many failures – rebooting ESP32");
    ESP.restart();
  }

  if (wifiConsecutiveFailures % 3 == 0) {
    Serial.println("[WIFI] Full reset cycle");
    WiFi.disconnect(true);
    delay(500);
    WiFi.mode(WIFI_STA);
    delay(200);
  }

  WiFi.begin(WIFI_SSID, WIFI_PASS);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < WIFI_CONNECT_TIMEOUT_MS) {
    delay(250);
    esp_task_wdt_reset();
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("[WIFI] Reconnected!");
    wifiRetryDelay = WIFI_RETRY_BASE_MS;
    wifiConsecutiveFailures = 0;
    ntpSynced = false;
  } else {
    wifiRetryDelay = min(wifiRetryDelay * 2, (unsigned long)WIFI_RETRY_MAX_MS);
    Serial.printf("[WIFI] Still disconnected, next retry in %lu ms\n", wifiRetryDelay);
  }
}

/**
 * Robust MQTT reconnection with rate limiting.
 */
void handleMqtt() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (mqtt.connected()) {
    mqtt.loop();
    return;
  }
  if (millis() - lastMqttRetry < 5000) return;
  lastMqttRetry = millis();
  Serial.println("[MQTT] Attempting connection...");
  if (mqtt.connect(DEVICE_NAME)) {
    Serial.println("[MQTT] Connected");
  } else {
    Serial.printf("[MQTT] Failed, rc=%d\n", mqtt.state());
  }
}

/* ================= SETUP ================= */
void setup() {
  Serial.begin(115200);
  Serial.println("[BOOT] ESP32 starting");

  // TFT
  pinMode(TFT_BL, OUTPUT);
  digitalWrite(TFT_BL, HIGH);
  tft.init(135, 240);
  tft.setRotation(3);
  tft.fillScreen(ST77XX_NAVY);
  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(2);
  tft.setCursor(10,10); tft.println("POND");
  tft.setCursor(10,30); tft.println("MONITOR by ML");
  tft.setTextSize(1);
  tft.setCursor(10,55); tft.println("Starting...");

  // Capteurs
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  sensors.begin();
  Wire.begin();

  // Scan I2C pour diagnostic
  Serial.println("[I2C] Scanning...");
  for (byte addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.printf("[I2C] Device found at 0x%02X\n", addr);
    }
  }

  if (!lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE)) {
    Serial.println("[BH1750] Device not detected!");
    bh1750Detected = false;
  } else bh1750Detected = true;

  if (bme.begin(0x76)) {
    Serial.println("[BME280] Detected at 0x76");
    bmeDetected = true;
  } else if (bme.begin(0x77)) {
    Serial.println("[BME280] Detected at 0x77");
    bmeDetected = true;
  } else if (bmp.begin(0x76)) {
    Serial.println("[BMP280] Detected at 0x76 (no humidity)");
    bmpDetected = true;
  } else if (bmp.begin(0x77)) {
    Serial.println("[BMP280] Detected at 0x77 (no humidity)");
    bmpDetected = true;
  } else {
    Serial.println("[BME/BMP280] Not detected!");
  }

  // WiFi – non-blocking initial connection with timeout
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(false);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting to WiFi ");
  unsigned long wifiStart = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - wifiStart < WIFI_CONNECT_TIMEOUT_MS) {
    delay(500);
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println(" connected!");
    tft.setCursor(10,55); tft.println("WiFi connected     ");
    configTzTime(TZ_PARIS, NTP_SERVER);
    struct tm timeinfo;
    if (getLocalTime(&timeinfo, 5000)) {
      ntpSynced = true;
      Serial.printf("[NTP] Time synced: %02d:%02d:%02d\n",
                    timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec);
    }
  } else {
    Serial.println(" timeout (will retry in loop)");
    tft.setCursor(10,55); tft.println("WiFi pending...    ");
  }

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setBufferSize(1024);
  
  // Init bubbles
  initBubbles();
  
  // Dessiner le fond statique une seule fois
  drawStaticBackground();

  // Hardware watchdog – resets ESP32 if loop hangs for WDT_TIMEOUT_S seconds
  esp_task_wdt_config_t wdtConfig = {
    .timeout_ms = WDT_TIMEOUT_S * 1000,
    .idle_core_mask = 0,
    .trigger_panic = true
  };
  esp_task_wdt_init(&wdtConfig);
  esp_task_wdt_add(NULL);
  Serial.println("[WDT] Watchdog enabled");
}

/* ================= LOOP ================= */
void loop() {
  esp_task_wdt_reset();

  handleWifi();
  handleMqtt();

  // Standby management: screen off between 20H and 7H
  bool standby = isStandbyTime();
  setScreenPower(!standby);

  // Lecture capteurs toutes les 2s (les DS18B20 sont lents)
  if (millis() - lastSensor >= 2000) {
    lastSensor = millis();
    sensors.requestTemperatures();
    g_t1 = safeDS18B20(0);
    g_t2 = safeDS18B20(1);
    g_tAvg = (g_t1 + g_t2) / 2.0f;
    g_ph  = safeAnalog(PH_PIN, 14.0f);
    g_ec  = safeAnalog(EC_PIN, 2000.0f);
    g_lux = bh1750Detected ? lightMeter.readLightLevel() : 0.0f;
    g_lvl = safeUltrason();
    if (bmeDetected) {
      g_airC = bme.readTemperature();
      g_pressPa = bme.readPressure();
    } else if (bmpDetected) {
      g_airC = bmp.readTemperature();
      g_pressPa = bmp.readPressure();
    }
  }

  // Rafraîchissement écran toutes les 500ms (seulement si écran allumé)
  if (screenOn && millis() - lastScreen >= 500) {
    lastScreen = millis();
    updateScreen();
  }

  // Envoi MQTT toutes les 5s
  if (millis() - lastMqtt >= 5000) {
    lastMqtt = millis();
    sendMqtt();
  }
}

/* ================= STATIC BACKGROUND ================= */
void drawStaticBackground() {
  tft.fillScreen(ST77XX_NAVY);
  
  // Title
  tft.setTextSize(2);
  tft.setCursor(5, 5);
  tft.setTextColor(ST77XX_CYAN);
  tft.print("POI Monitor by ML");
  
  tft.drawFastHLine(0, 25, 240, ST77XX_LIGHTGREY);
  
  // Labels statiques
  tft.setTextSize(1);
  tft.setTextColor(ST77XX_WHITE);
  tft.setCursor(5, 32); tft.print("Temp:");
  tft.setCursor(5, 65); tft.print("pH:");
  tft.setCursor(5, 98); tft.print("EC:");
  
  // Poisson (dessiné une seule fois)
  drawFish(190, 105, ST77XX_ORANGE);
}

/* ================= SCREEN UPDATE ================= */
void updateScreen() {
  // Effacer uniquement les zones de valeurs (pas tout l'écran)
  tft.setTextColor(ST77XX_WHITE, ST77XX_NAVY);
  
  // Température eau (valeur)
  tft.setTextSize(2);
  tft.setCursor(35, 32);
  tft.printf("%.1fC ", g_tAvg);
  tft.setTextSize(1);
  drawBar(5, 52, 110, g_tAvg, 18, 28);

  // pH (valeur)
  tft.setTextSize(2);
  tft.setCursor(23, 65);
  tft.printf(" %.1f  ", g_ph);
  tft.setTextSize(1);
  drawBar(5, 85, 110, g_ph, 6.2, 7.2);

  // EC (valeur)
  tft.setTextSize(2);
  tft.setCursor(23, 98);
  tft.printf(" %.0f  ", g_ec);
  tft.setTextSize(1);
  drawBar(5, 118, 110, g_ec, 500, 1500);

  // Info supplémentaires (colonne droite)
  tft.setTextSize(1);
  tft.setCursor(120, 32); tft.printf("T1:%.1f T2:%.1f ", g_t1, g_t2);
  tft.setCursor(120, 44); tft.printf("Lux:%.0f Niv:%.0f ", g_lux, g_lvl);
  tft.setCursor(120, 56); tft.printf("Air:%.1fC      ", g_airC);
  tft.setCursor(120, 68); tft.printf("P:%4.0f hPa ", g_pressPa / 100.0f);

  // Poisson (couleur selon qualité eau)
  drawFish(190, 105, globalFishColor(g_tAvg, g_ph, g_ec));

  // Animation bulles
  animateBubbles();
}

/* ================= MQTT SEND ================= */
void sendMqtt() {
  if (!mqtt.connected()) {
    Serial.println("[MQTT] not connected, skip send");
    return;
  }

  String delta;
  delta.reserve(1024);

  delta += "{";
  delta += "\"context\":\"vessels.self\",";
  delta += "\"updates\":[{";
  delta += "\"source\":{\"label\":\"esp32-pond\",\"type\":\"sensor\"},";
  delta += "\"values\":[";

  // Eau – températures
  delta += "{\"path\":\"tanks.liveWell.pond.temperature\",\"value\":" + String(g_tAvg, 2) + "},";
  delta += "{\"path\":\"tanks.liveWell.pond1.temperature\",\"value\":" + String(g_t1, 2) + "},";
  delta += "{\"path\":\"tanks.liveWell.pond2.temperature\",\"value\":" + String(g_t2, 2) + "},";

  // Eau – chimie / niveau
  delta += "{\"path\":\"tanks.liveWell.pond.ph\",\"value\":" + String(g_ph, 2) + "},";
  delta += "{\"path\":\"tanks.liveWell.pond.conductivity\",\"value\":" + String(g_ec, 0) + "},";
  delta += "{\"path\":\"tanks.liveWell.pond.currentLevel\",\"value\":" + String(g_lvl / 100.0f, 2) + "},";

  // Lumière
  delta += "{\"path\":\"environment.inside.pond.illuminance\",\"value\":" + String(g_lux, 0) + "},";

  // Air au-dessus du bassin
  delta += "{\"path\":\"environment.inside.pond.temperature\",\"value\":" + String(g_airC, 2) + "},";
  delta += "{\"path\":\"environment.inside.pond.pressure\",\"value\":" + String(g_pressPa, 0) + "}";

  delta += "]";
  delta += "}]";
  delta += "}";

  bool ok = mqtt.publish("signalk/delta", delta.c_str());
  Serial.println(ok ? "[MQTT] SignalK delta sent" : "[MQTT] publish FAILED");
}

