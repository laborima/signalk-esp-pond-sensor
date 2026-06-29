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
#define ST77XX_RED       0xF800
#define ST77XX_GREEN     0x07E0
#define ST77XX_ORANGE    0xFD20
#define ST77XX_WHITE     0xFFFF
#define ST77XX_BLACK     0x0000
#define ST77XX_CYAN      0x07FF

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
#define ULTRASOUND_TIMEOUT_US 30000   // 6 000 µs → ~1 m max, amplement suffisant pour 100 cm
#define H_CAPTEUR_CM          100.0f  // hauteur du capteur au-dessus du fond du bassin (à ajuster)

/* ================= ANALOG ================= */
#define PH_PIN 33
#define EC_PIN 32

/* ================= RELAYS ================= */
#define RELAY_EC_PH_PIN 17
#define RELAY_LIGHT_PIN 15
//
// Câblage du relai RELAY_EC_PH_PIN :
//   OPEN  (HIGH) → alimente la sonde PH  (EC éteinte)
//   CLOSED (LOW) → alimente la sonde EC  (PH éteinte)
//
// La sonde PH est TOUJOURS hors tension pendant les phases
// CHEM_EC_STABILIZING et CHEM_EC_SAMPLING, ce qui évite :
//   - toute diaphonie électrique entre les deux sondes
//   - une mesure pH parasite pendant la lecture EC
//
#define RELAY_LEVEL_CLOSED LOW   // → EC alimentée, PH éteinte
#define RELAY_LEVEL_OPEN   HIGH  // → PH alimentée, EC éteinte

/* ================= RELAY / EC TIMING ================= */
#define EC_INTERVAL_MS        (10UL * 60UL * 1000UL) // période entre deux cycles EC
#define PH_SAMPLE_INTERVAL_MS 2000UL                  // période lecture pH (ms)
#define PH_STABILIZE_MS       3000UL                  // repos électrique après bascule vers PH
#define RELAY_STABILIZE_MS    3000UL                  // stabilisation après bascule EC
                                                       // (augmenté 1500→3000 ms)
#define EC_NUM_SAMPLES        16                       // lectures ADC à moyenner
#define EC_SAMPLE_INTERVAL_MS 50UL                     // délai entre chaque lecture EC
                                                       // (16 × 50 ms ≈ 800 ms d'acqu.)

/* ================= PH CALIBRATION ================= */
float voltage_ph7 = 2.502f; // Tension en solution pH 7
float ph_slope    = 0.186f; // Pente V/pH (pH7=2.502V, pH9=2.130V)
// Température moyenne durant l'étalonnage (18.09 °C et 19.30 °C)
const float ph_cal_temp_c = 18.7f;

/* ================= PH VALIDITY ================= */
#define PH_MIN_RAW  50      // en-dessous → sonde considérée absente
#define PH_MIN_VAL  0.0f
#define PH_MAX_VAL  14.0f

/* ================= I2C ================= */
BH1750          lightMeter;
Adafruit_BME280 bme;
Adafruit_BMP280 bmp;
bool bmeDetected    = false;
bool bmpDetected    = false;
bool bh1750Detected = false;

/* ================= NETWORK ================= */
WiFiClient   espClient;
PubSubClient mqtt(espClient);

/* ================= TIMERS ================= */
unsigned long lastScreen    = 0;
unsigned long lastMqtt      = 0;
unsigned long lastSensor    = 0;
unsigned long lastWifiCheck = 0;
unsigned long lastMqttRetry = 0;
unsigned long lastPh        = 0;
unsigned long lastEc        = 0;   // horodatage du dernier cycle EC complet
unsigned long ecSwitchTime  = 0;   // horodatage du basculement vers EC
unsigned long lastEcSample  = 0;   // horodatage du dernier échantillon ADC EC
unsigned long lastUltrason  = 0;   // ultrason géré séparément (pulseIn bloquant)

/* ================= DS18B20 ASYNC ================= */
#define DS18B20_CONVERSION_MS 800
bool          ds18b20ConversionPending = false;
unsigned long ds18b20RequestTime       = 0;

/* ================= WIFI STATE ================= */
unsigned long wifiRetryDelay          = WIFI_RETRY_BASE_MS;
int           wifiConsecutiveFailures = 0;
bool          screenOn    = true;
bool          ntpSynced   = false;
bool          logger_debug = true;

enum WifiConnState { WIFI_IDLE, WIFI_CONNECTING };
WifiConnState wifiConnState = WIFI_IDLE;
unsigned long wifiConnStart = 0;

/* ================= CHEMISTRY STATE MACHINE ================= */
//
// Cycle complet (PH éteinte pendant toute la durée EC) :
//
//  CHEM_PH_READING  (relai OPEN → PH ON, EC OFF)
//    └─ lit pH toutes les 2 s
//    └─ après EC_INTERVAL_MS → switchToEcRelay()
//         ↓
//  CHEM_EC_STABILIZING  (relai CLOSED → EC ON, PH OFF)
//    └─ attend 3 000 ms sans rien lire (transitoires, rebonds)
//         ↓
//  CHEM_EC_SAMPLING  (relai CLOSED → EC ON, PH OFF)
//    └─ accumule 16 lectures ADC espacées de 50 ms
//    └─ calcule la moyenne → g_ec
//    └─ switchToPhRelay() → retour CHEM_PH_READING
//
enum ChemState {
  CHEM_PH_READING,
  CHEM_EC_STABILIZING,
  CHEM_EC_SAMPLING,
};
ChemState chemState = CHEM_PH_READING;

/* ================= EC SAMPLING ACCUMULATORS ================= */
uint8_t  ecSampleCount = 0;
uint32_t ecSampleSum   = 0;

/* ================= SENSOR DATA (cached) ================= */
float         g_t1 = 0, g_t2 = 0, g_tAvg = 0;
float         g_ph = NAN, g_ph_voltage = 0;
float         g_ec = 0,   g_ec_voltage = 0;
float         g_lux = 0,  g_lvl = NAN;
int           g_ph_raw = 0, g_ec_raw = 0;
float         g_airC = 0,   g_pressPa = 0;
unsigned long g_echo_us = 0;

/* ================= ANIMATION ================= */
struct Bubble {
  float x, y, oldX, oldY, speed;
  int   radius;
};
Bubble bubbles[3];

/* ================= FORWARD DECLARATIONS ================= */
void drawStaticBackground();
void updateScreen();
void sendMqtt();
void drawFish(int x, int y, uint16_t bodyColor);
void drawBar(int x, int y, int w, float v, float vmin, float vmax, uint16_t bg);
void animateBubbles();
void switchToEcRelay();
void switchToPhRelay();

/* ================= BUBBLES ================= */
void initBubbles() {
  for (int i = 0; i < 3; i++) {
    bubbles[i].x      = 190 + random(-15, 15);
    bubbles[i].y      = 115 + random(0, 10);
    bubbles[i].oldX   = bubbles[i].x;
    bubbles[i].oldY   = bubbles[i].y;
    bubbles[i].speed  = 0.5f + random(0, 5) / 10.0f;
    bubbles[i].radius = 2;
  }
}

void animateBubbles() {
  for (int i = 0; i < 3; i++) {
    tft.fillCircle((int)bubbles[i].oldX, (int)bubbles[i].oldY,
                   bubbles[i].radius + 1, ST77XX_NAVY);
    bubbles[i].oldX = bubbles[i].x;
    bubbles[i].oldY = bubbles[i].y;
    bubbles[i].y   -= bubbles[i].speed;
    bubbles[i].x   += (random(0, 3) - 1) * 0.3f;
    if (bubbles[i].y < 85) {
      bubbles[i].y = 120;
      bubbles[i].x = 190 + random(-15, 15);
    }
    tft.drawCircle((int)bubbles[i].x, (int)bubbles[i].y,
                   bubbles[i].radius, ST77XX_LIGHTBLUE);
  }
}

/* ================= UTILS ================= */
uint16_t colorByRange(float v, float vmin, float vmax) {
  if (isnan(v) || v < vmin || v > vmax) return ST77XX_RED;
  if (v < vmin + (vmax - vmin) * 0.2f || v > vmax - (vmax - vmin) * 0.2f)
    return ST77XX_ORANGE;
  return ST77XX_GREEN;
}

float readUltrasonCm() {
  static unsigned long lastTimeoutLog = 0;
  static unsigned long lastSuccessLog = 0;

  digitalWrite(TRIG_PIN, LOW);  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long d = pulseIn(ECHO_PIN, HIGH, ULTRASOUND_TIMEOUT_US);
  g_echo_us = (d <= 0) ? 0 : (unsigned long)d;
  if (d <= 0) {
    if (logger_debug && millis() - lastTimeoutLog > 2000) {
      Serial.printf("[ULTRASOUND] Timeout (TRIG=%d->LOW/HIGH/LOW, ECHO=%d level=%d, t=%lu us)\n",
                    TRIG_PIN, ECHO_PIN, digitalRead(ECHO_PIN), ULTRASOUND_TIMEOUT_US);
      lastTimeoutLog = millis();
    }
    return NAN;
  }
  if (logger_debug && millis() - lastSuccessLog > 5000) {
    Serial.printf("[ULTRASOUND] Echo=%lu us (TRIG=%d ECHO=%d)\n",
                  g_echo_us, TRIG_PIN, ECHO_PIN);
    lastSuccessLog = millis();
  }
  float dist  = d * 0.034f / 2.0f;          // distance capteur → surface eau (cm)
  float niveau = H_CAPTEUR_CM - dist;        // niveau eau depuis le fond (cm)
  return (niveau < 0.0f) ? 0.0f : niveau;    // clamp à 0 si capteur hors eau
}


float safeDS18B20(uint8_t idx, float lastGood) {
  float t = sensors.getTempCByIndex(idx);
  if (t == DEVICE_DISCONNECTED_C || t < -40.0f || t > 125.0f) {
    if (logger_debug)
      Serial.printf("[DS18B20] Sensor %d invalid: %.2f, keeping %.2f\n", idx, t, lastGood);
    return lastGood;
  }
  return t;
}

float phSlopeAtTemperature(float tempC) {
  if (tempC < -40.0f || tempC > 125.0f) {
    return ph_slope;
  }
  const float calKelvin   = ph_cal_temp_c + 273.15f;
  const float targetKelvin = tempC + 273.15f;
  return ph_slope * (targetKelvin / calKelvin);
}

float safeUltrason() {
  float lvl = readUltrasonCm();
  return isnan(lvl) ? g_lvl : lvl;
}

/* ================= RELAY ================= */
void switchToEcRelay() {
  // Coupe PH, alimente EC
  digitalWrite(RELAY_EC_PH_PIN, RELAY_LEVEL_CLOSED);
  ecSwitchTime = millis();
  chemState    = CHEM_EC_STABILIZING;
  if (logger_debug) Serial.println("[RELAY] PH OFF, EC ON → stabilizing");
}

void switchToPhRelay() {
  // Coupe EC, ralume PH
  digitalWrite(RELAY_EC_PH_PIN, RELAY_LEVEL_OPEN);
  ecSwitchTime = millis();
  chemState    = CHEM_PH_READING;
  if (logger_debug) Serial.println("[RELAY] EC OFF, PH ON → reading");
}

/* ================= SENSORS ================= */
void readEnvironment() {
  // Lux uniquement : lecture I2C rapide (~1 ms), non-bloquante
  // L'ultrason est géré séparément dans le loop() car pulseIn() bloque
  // jusqu'à 25 ms — l'appeler ici perturberait mqtt.loop()
  g_lux = bh1750Detected ? lightMeter.readLightLevel() : 0.0f;
}

void readPhSensor() {
  // Appelé UNIQUEMENT dans CHEM_PH_READING (relai OPEN → PH alimentée)
  int sum = 0;
  for (int i = 0; i < 10; i++) {
    sum += analogRead(PH_PIN);
    delayMicroseconds(200);
  }
  g_ph_raw     = sum / 10;
  g_ph_voltage = g_ph_raw * 3.3f / 4095.0f;

  if (g_ph_raw < PH_MIN_RAW) {
    if (logger_debug) Serial.println("[PH] Sonde absente ou déconnectée");
    g_ph = NAN;
    return;
  }

  float tempForComp = g_tAvg;
  if (tempForComp < -40.0f || tempForComp > 125.0f) {
    tempForComp = (g_airC > -40.0f && g_airC < 85.0f) ? g_airC : ph_cal_temp_c;
  }
  float slope      = phSlopeAtTemperature(tempForComp);
  float ph         = 7.0f - (g_ph_voltage - voltage_ph7) / slope;
  g_ph = constrain(ph, PH_MIN_VAL, PH_MAX_VAL);
}

/* ================= CHEMISTRY STATE MACHINE ================= */
void handleChemistryCycle() {
  unsigned long now = millis();

  // Lux + niveau : rafraîchis dans tous les états
  static unsigned long lastEnv = 0;
  if (now - lastEnv >= PH_SAMPLE_INTERVAL_MS) {
    lastEnv = now;
    readEnvironment();
  }

  switch (chemState) {

    // ── PH en lecture continue ──────────────────────────────────
    case CHEM_PH_READING:
      // La sonde PH est alimentée (relai OPEN)
      static bool phSettlingLogged = false;
      static bool ds18WaitLogged   = false;

      if (ds18b20ConversionPending) {
        if (!ds18WaitLogged && logger_debug)
          Serial.println("[PH] Waiting DS18B20 conversion to finish");
        ds18WaitLogged = true;
        return; // éviter activité bus pendant pH
      }
      ds18WaitLogged = false;

      if (now - ecSwitchTime < PH_STABILIZE_MS) {
        if (!phSettlingLogged && logger_debug)
          Serial.println("[PH] Settling after EC → waiting PH_STABILIZE_MS");
        phSettlingLogged = true;
        return; // repos électrique après EC
      }
      phSettlingLogged = false;
      if (now - lastPh >= PH_SAMPLE_INTERVAL_MS) {
        lastPh = now;
        readPhSensor();
        if (logger_debug)
          Serial.printf("[PH] raw=%d V=%.3f pH=%.2f\n",
                        g_ph_raw, g_ph_voltage, g_ph);
      }
      // Déclencher le cycle EC si délai écoulé
      if (now - lastEc >= EC_INTERVAL_MS) {
        switchToEcRelay(); // → PH éteinte, EC alimentée, état STABILIZING
      }
      break;

    // ── Stabilisation (PH éteinte, EC alimentée, rien lu) ───────
    case CHEM_EC_STABILIZING:
      // On laisse les condensateurs de câble se charger, les rebonds
      // de contact du relai s'amortir et l'alimentation de la sonde
      // EC se stabiliser. Aucune lecture pendant cette phase.
      if (now - ecSwitchTime >= RELAY_STABILIZE_MS) {
        // Initialiser l'accumulateur
        ecSampleCount = 0;
        ecSampleSum   = 0;
        lastEcSample  = now; // 1ère lecture immédiate à l'entrée dans SAMPLING
        chemState     = CHEM_EC_SAMPLING;
        if (logger_debug) Serial.println("[EC] Stable → sampling started");
      }
      break;

    // ── Échantillonnage EC moyenné (PH toujours éteinte) ────────
    case CHEM_EC_SAMPLING:
      if (now - lastEcSample >= EC_SAMPLE_INTERVAL_MS) {
        lastEcSample = now;
        int raw = analogRead(EC_PIN);
        ecSampleSum += (uint32_t)raw;
        ecSampleCount++;

        if (logger_debug)
          Serial.printf("[EC] sample %u/%u raw=%d\n",
                        ecSampleCount, EC_NUM_SAMPLES, raw);

        if (ecSampleCount >= EC_NUM_SAMPLES) {
          // Calcul de la moyenne
          g_ec_raw     = (int)(ecSampleSum / EC_NUM_SAMPLES);
          g_ec_voltage = g_ec_raw * 3.3f / 4095.0f;
          g_ec         = g_ec_raw / 4095.0f * 2000.0f;
          lastEc       = now;

          if (logger_debug)
            Serial.printf("[EC] DONE avg raw=%d V=%.3f EC=%.0f uS/cm (%u samples)\n",
                          g_ec_raw, g_ec_voltage, g_ec, ecSampleCount);

          // Éteindre EC, rallumer PH → retour CHEM_PH_READING
          switchToPhRelay();
        }
      }
      break;
  }
}

/* ================= DRAW ================= */
void drawBar(int x, int y, int w, float v, float vmin, float vmax,
             uint16_t bg = ST77XX_DARKGREY) {
  tft.fillRect(x, y, w, 8, bg);
  if (!isnan(v)) {
    int bw = constrain((int)((v - vmin) * (w - 2) / (vmax - vmin)), 0, w - 2);
    tft.fillRect(x + 1, y + 1, bw, 6, colorByRange(v, vmin, vmax));
  }
}

uint16_t globalFishColor(float t, float ph, float ec) {
  if (isnan(ph)) return ST77XX_ORANGE;
  if (t < 8  || t > 30 || ph < 6.0f || ph > 8.0f || ec < 200 || ec > 2000)
    return ST77XX_RED;
  if (t < 10 || t > 28 || ph < 6.4f || ph > 7.5f)
    return ST77XX_ORANGE;
  return ST77XX_GREEN;
}

void drawFish(int x, int y, uint16_t bodyColor) {
  tft.fillCircle(x,     y,  12, bodyColor);
  tft.fillCircle(x - 6, y,  10, bodyColor);
  tft.fillCircle(x + 6, y,  10, bodyColor);
  tft.fillTriangle(x-18, y,   x-28, y-10, x-28, y+10, bodyColor);
  tft.fillTriangle(x-20, y-3, x-30, y-12, x-26, y-8,  bodyColor);
  tft.fillTriangle(x-20, y+3, x-30, y+12, x-26, y+8,  bodyColor);
  tft.fillTriangle(x-2,  y-8, x-6,  y-14, x+2,  y-10, bodyColor);
  tft.fillTriangle(x-2,  y+8, x-6,  y+14, x+2,  y+10, bodyColor);
  tft.fillCircle(x + 4,  y - 4, 4, ST77XX_WHITE);
  tft.fillCircle(x + 5,  y - 4, 2, ST77XX_BLACK);
  tft.drawPixel(x + 6,   y - 5,    ST77XX_WHITE);
  tft.drawLine(x + 10, y + 2, x + 12, y + 3, ST77XX_BLACK);
  uint16_t sc = (bodyColor == ST77XX_ORANGE || bodyColor == ST77XX_RED)
                ? ST77XX_GOLD : ST77XX_LIGHTBLUE;
  tft.drawCircle(x - 4, y - 2, 3, sc);
  tft.drawCircle(x + 2, y,     3, sc);
  tft.drawCircle(x - 4, y + 2, 3, sc);
}

/* ================= TIME ================= */
int getCurrentHour() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 0)) return -1;
  return timeinfo.tm_hour;
}

bool isStandbyTime() {
  int h = getCurrentHour();
  if (h < 0) return false;
  return (h >= STANDBY_HOUR_START || h < STANDBY_HOUR_END);
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

/* ================= WIFI (non-bloquant) ================= */
void handleWifi() {
  static wl_status_t lastWifiStatus = WL_IDLE_STATUS;
  wl_status_t currentStatus = WiFi.status();

  if (currentStatus != lastWifiStatus && logger_debug) {
    Serial.printf("[WIFI] State change: %d -> %d\n", lastWifiStatus, currentStatus);
    lastWifiStatus = currentStatus;
  }

  if (WiFi.status() == WL_CONNECTED) {
    wifiRetryDelay          = WIFI_RETRY_BASE_MS;
    wifiConsecutiveFailures = 0;
    wifiConnState           = WIFI_IDLE;

    if (!ntpSynced) {
      configTzTime(TZ_PARIS, NTP_SERVER);
      struct tm timeinfo;
      if (getLocalTime(&timeinfo, 0)) { // non-bloquant
        ntpSynced = true;
        Serial.println("[NTP] Time synced");
      }
    }
    return;
  }

  // Connexion en cours → vérifier le timeout sans bloquer le loop
  if (wifiConnState == WIFI_CONNECTING) {
    if (millis() - wifiConnStart < WIFI_CONNECT_TIMEOUT_MS) return;

    wifiConnState = WIFI_IDLE;
    wifiRetryDelay = min(wifiRetryDelay * 2, (unsigned long)WIFI_RETRY_MAX_MS);
    wifiConsecutiveFailures++;
    Serial.printf("[WIFI] Timeout – attempt %d, next retry in %lu ms\n",
                  wifiConsecutiveFailures, wifiRetryDelay);

    if (wifiConsecutiveFailures >= WIFI_MAX_FAILURES) {
      Serial.println("[WIFI] Too many failures – rebooting");
      ESP.restart();
    }
    return;
  }

  // Attendre le délai de backoff
  if (millis() - lastWifiCheck < wifiRetryDelay) return;
  lastWifiCheck = millis();

  if (wifiConsecutiveFailures > 0 && wifiConsecutiveFailures % 3 == 0) {
    Serial.println("[WIFI] Full reset cycle");
    WiFi.disconnect(true);
    delay(100); // seul delay court toléré ici
    WiFi.mode(WIFI_STA);
  }

  Serial.printf("[WIFI] Connecting (attempt %d)...\n", wifiConsecutiveFailures + 1);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  wifiConnState = WIFI_CONNECTING;
  wifiConnStart = millis();
}

/* ================= MQTT ================= */
void handleMqtt() {
  static bool wasConnected = false;

  if (WiFi.status() != WL_CONNECTED) return;

  // mqtt.loop() DOIT être appelé à chaque tour de boucle quand connecté :
  // il traite les ACK, répond aux PINGREQ du broker et détecte les déconnexions.
  // Ne pas le conditionner à autre chose que mqtt.connected().
  if (mqtt.connected()) {
    if (!wasConnected && logger_debug) {
      Serial.println("[MQTT] Connected (loop active)");
    }
    wasConnected = true;
    mqtt.loop();
    return;
  }

  if (wasConnected && logger_debug) {
    Serial.println("[MQTT] Disconnected – will retry");
  }
  wasConnected = false;

  // Reconnexion avec rate-limiting (5 s entre tentatives)
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
  tft.setCursor(10, 10); tft.println("POND");
  tft.setCursor(10, 30); tft.println("MONITOR by ML");
  tft.setTextSize(1);
  tft.setCursor(10, 55); tft.println("Starting...");

  // Capteurs
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT_PULLDOWN);
  sensors.begin();
  sensors.setWaitForConversion(false);
  Wire.begin();

  // Lecture ultrason initiale pour alimenter g_echo_us dès le boot
  g_lvl = safeUltrason();
  if (logger_debug)
    Serial.printf("[ULTRASOUND] Boot read: %.1f cm (%u us)\n", g_lvl, (uint32_t)g_echo_us);

  // Relais
  pinMode(RELAY_EC_PH_PIN, OUTPUT);
  pinMode(RELAY_LIGHT_PIN, OUTPUT);
  digitalWrite(RELAY_LIGHT_PIN, RELAY_LEVEL_OPEN);

  // Démarrer sur PH (relai OPEN → PH alimentée, EC éteinte)
  switchToPhRelay();

  // 1er cycle EC dans ~5 s (laisse le temps aux capteurs de s'initialiser)
  lastEc = millis() - EC_INTERVAL_MS + 5000UL;

  // Seed aléatoire pour les bulles
  randomSeed(analogRead(34));

  // Scan I2C
  Serial.println("[I2C] Scanning...");
  for (byte addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0)
      Serial.printf("[I2C] Device found at 0x%02X\n", addr);
  }

  if (!lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE)) {
    Serial.println("[BH1750] Not detected!");
  } else {
    bh1750Detected = true;
  }

  if      (bme.begin(0x76)) { Serial.println("[BME280] 0x76"); bmeDetected = true; }
  else if (bme.begin(0x77)) { Serial.println("[BME280] 0x77"); bmeDetected = true; }
  else if (bmp.begin(0x76)) { Serial.println("[BMP280] 0x76"); bmpDetected = true; }
  else if (bmp.begin(0x77)) { Serial.println("[BMP280] 0x77"); bmpDetected = true; }
  else                       { Serial.println("[BME/BMP280] Not detected!"); }

  // WiFi non-bloquant
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(false);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  wifiConnState = WIFI_CONNECTING;
  wifiConnStart = millis();
  Serial.println("[WIFI] Connection started");
  tft.setCursor(10, 55); tft.println("WiFi pending...    ");

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setBufferSize(1024);

  initBubbles();
  drawStaticBackground();

  // Watchdog matériel
  esp_task_wdt_config_t wdtConfig = {
    .timeout_ms     = WDT_TIMEOUT_S * 1000,
    .idle_core_mask = 0,
    .trigger_panic  = true
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

  // Gestion veille écran
  setScreenPower(!isStandbyTime());

  // DS18B20 asynchrone
  if (!ds18b20ConversionPending && millis() - lastSensor >= 2000) {
    sensors.requestTemperatures();
    ds18b20ConversionPending = true;
    ds18b20RequestTime       = millis();
  }
  if (ds18b20ConversionPending && millis() - ds18b20RequestTime >= DS18B20_CONVERSION_MS) {
    ds18b20ConversionPending = false;
    lastSensor               = millis();

    g_t1   = safeDS18B20(0, g_t1);
    g_t2   = safeDS18B20(1, g_t2);
    g_tAvg = (g_t1 + g_t2) / 2.0f;

    if (bmeDetected) {
      g_airC    = bme.readTemperature();
      g_pressPa = bme.readPressure();
    } else if (bmpDetected) {
      g_airC    = bmp.readTemperature();
      g_pressPa = bmp.readPressure();
    }

    if (logger_debug)
      Serial.printf("[TEMP] T1=%.2f T2=%.2f Avg=%.2f Air=%.2f P=%.0f\n",
                    g_t1, g_t2, g_tAvg, g_airC, g_pressPa);
  }

  // Machine d'état chimie
  handleChemistryCycle();

  // Ultrason : toutes les 5 s, isolé ici car pulseIn() bloque jusqu'à 25 ms
  // Ne pas l'appeler depuis handleChemistryCycle() pour ne pas retarder mqtt.loop()
  if (millis() - lastUltrason >= 5000) {
    lastUltrason = millis();
    g_lvl = safeUltrason();
    if (logger_debug)
      Serial.printf("[ULTRASOUND] %.1f cm (%u us)\n", g_lvl, (uint32_t)g_echo_us);
  }

  // Rafraîchissement écran 500 ms
  if (screenOn && millis() - lastScreen >= 500) {
    lastScreen = millis();
    updateScreen();
  }

  // Envoi MQTT 5 s
  if (millis() - lastMqtt >= 5000) {
    lastMqtt = millis();
    sendMqtt();
  }
}

/* ================= STATIC BACKGROUND ================= */
void drawStaticBackground() {
  tft.fillScreen(ST77XX_NAVY);

  tft.setTextSize(2);
  tft.setCursor(5, 5);
  tft.setTextColor(ST77XX_CYAN);
  tft.print("POI Monitor by ML");
  tft.drawFastHLine(0, 25, 240, ST77XX_LIGHTGREY);

  tft.setTextSize(1);
  tft.setTextColor(ST77XX_WHITE);
  tft.setCursor(5,  32); tft.print("Temp:");
  tft.setCursor(5,  65); tft.print("pH:");
  tft.setCursor(5,  98); tft.print("EC:");

  drawFish(198, 105, ST77XX_ORANGE);
}

/* ================= SCREEN UPDATE ================= */
void updateScreen() {
  tft.setTextColor(ST77XX_WHITE, ST77XX_NAVY);

  // --- Température ---
  tft.setTextSize(2);
  tft.setCursor(35, 32);
  tft.printf("%.1fC ", g_tAvg);
  tft.setTextSize(1);
  drawBar(5, 52, 110, g_tAvg, 18, 28);

  // --- pH ---
  // Affiche "---" si sonde absente OU si la sonde PH est éteinte (cycle EC)
  tft.setTextSize(2);
  tft.setCursor(23, 65);
  if (isnan(g_ph) || chemState != CHEM_PH_READING) {
    tft.print(" ---  ");
  } else {
    tft.printf(" %.1f  ", g_ph);
  }
  tft.setTextSize(1);
  drawBar(5, 85, 110, isnan(g_ph) ? 0.0f : g_ph, 6.2f, 7.2f);

  // --- EC ---
  // Affiche l'état du cycle pendant la mesure
  tft.setTextSize(2);
  tft.setCursor(23, 98);
  if (chemState == CHEM_EC_STABILIZING) {
    tft.print(" STB  ");            // stabilisation relai en cours
  } else if (chemState == CHEM_EC_SAMPLING) {
    tft.printf(" %2u/%-2u", ecSampleCount, EC_NUM_SAMPLES); // progression
  } else {
    tft.printf(" %.0f  ", g_ec);   // dernière valeur EC connue
  }
  tft.setTextSize(1);
  drawBar(5, 118, 110, g_ec, 500, 1500);

  // --- Colonne droite ---
  tft.setTextSize(1);
  tft.setCursor(120, 32);  tft.printf("T1:%.1f T2:%.1f ", g_t1, g_t2);
  tft.setCursor(120, 44);
  if (isnan(g_lvl))
      tft.printf("Lux:%.0f Niv:--- ", g_lux);
  else
      tft.printf("Lux:%.0f Niv:%.0fcm ", g_lux, g_lvl);
  tft.setCursor(120, 56);  tft.printf("Air:%.1fC      ", g_airC);
  tft.setCursor(120, 68);  tft.printf("P:%4.0f hPa ", g_pressPa / 100.0f);
  tft.setCursor(120, 80);  tft.printf("VpH:%.3f", g_ph_voltage);
  tft.setCursor(120, 92);  tft.printf("VEC:%.3f", g_ec_voltage);
  tft.setCursor(120, 104); tft.printf("ECHO:%5u", (uint32_t)g_echo_us);

  drawFish(198, 105, globalFishColor(g_tAvg, g_ph, g_ec));
  animateBubbles();
}

/* ================= MQTT SEND ================= */
void sendMqtt() {
  if (!mqtt.connected()) {
    Serial.printf("[MQTT] not connected, skip send (state=%d)\n", mqtt.state());
    return;
  }

  // pH : null si invalide (JSON valide, ignoré par SignalK)
  char phStr[12];
  if (isnan(g_ph)) snprintf(phStr, sizeof(phStr), "null");
  else             snprintf(phStr, sizeof(phStr), "%.2f", g_ph);

  // EC / niveau : null si invalide pour rester JSON-valide
  char ecStr[16];
  if (isnan(g_ec)) snprintf(ecStr, sizeof(ecStr), "null");
  else             snprintf(ecStr, sizeof(ecStr), "%.0f", g_ec);

  char lvlStr[16];
  if (isnan(g_lvl)) snprintf(lvlStr, sizeof(lvlStr), "null");
  else              snprintf(lvlStr, sizeof(lvlStr), "%.2f", g_lvl / 100.0f);

  char buf[768];
  int pos = snprintf(buf, sizeof(buf),
    "{"
      "\"context\":\"vessels.self\","
      "\"updates\":[{"
        "\"source\":{\"label\":\"esp32-pond\",\"type\":\"sensor\"},"
        "\"values\":["
          "{\"path\":\"tanks.liveWell.pond.temperature\",\"value\":%.2f},"
          "{\"path\":\"tanks.liveWell.pond1.temperature\",\"value\":%.2f},"
          "{\"path\":\"tanks.liveWell.pond2.temperature\",\"value\":%.2f},"
          "{\"path\":\"tanks.liveWell.pond.ph\",\"value\":%s},"
          "{\"path\":\"tanks.liveWell.pond.phVoltage\",\"value\":%.3f},"
          "{\"path\":\"tanks.liveWell.pond.conductivity\",\"value\":%s},"
          "{\"path\":\"tanks.liveWell.pond.conductivityVoltage\",\"value\":%.3f},"
          "{\"path\":\"tanks.liveWell.pond.currentLevel\",\"value\":%s},"
          "{\"path\":\"environment.inside.pond.illuminance\",\"value\":%.0f},"
          "{\"path\":\"environment.inside.pond.temperature\",\"value\":%.2f},"
          "{\"path\":\"environment.inside.pond.pressure\",\"value\":%.0f}"
        "]"
      "}]"
    "}",
    g_tAvg, g_t1, g_t2,
    phStr, g_ph_voltage,
    ecStr, g_ec_voltage,
    lvlStr,
    g_lux,
    g_airC, g_pressPa
  );

  if (pos < 0 || pos >= (int)sizeof(buf)) {
    Serial.println("[MQTT] Buffer overflow – payload tronqué !");
    return;
  }

  if (logger_debug) {
    Serial.printf("[MQTT] Publish signalk/delta len=%d\n", pos);
    Serial.printf("[MQTT] Payload: %s\n", buf);
  }

  bool ok = mqtt.publish("signalk/delta", buf);
  if (!ok) {
    Serial.printf("[MQTT] publish FAILED (state=%d)\n", mqtt.state());
  } else {
    Serial.println("[MQTT] SignalK delta sent");
  }
}