#include <WiFi.h>
#include <PubSubClient.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7735.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Wire.h>
#include <BH1750.h>
#include <Adafruit_BMP280.h>   // BMP280 (air temp + pressure)
// #include <Adafruit_BME280.h> // ← option humidité
#include "config.h"

/* ================= TFT ================= */
#define TFT_CS   15
#define TFT_DC   2
#define TFT_RST  4
Adafruit_ST7735 tft = Adafruit_ST7735(TFT_CS, TFT_DC, TFT_RST);

/* ================= DS18B20 ================= */
#define ONEWIRE_PIN 27
OneWire oneWire(ONEWIRE_PIN);
DallasTemperature sensors(&oneWire);

/* ================= ULTRASON ================= */
#define TRIG_PIN 25
#define ECHO_PIN 26

/* ================= ANALOG ================= */
#define PH_PIN 35
#define EC_PIN 34

/* ================= I2C ================= */
BH1750 lightMeter;
Adafruit_BMP280 bmp;   // BMP280 air

/* ================= NETWORK ================= */
WiFiClient espClient;
PubSubClient mqtt(espClient);

/* ================= UTILS ================= */
float toKelvin(float c) { return c + 273.15f; }

uint16_t colorByRange(float v, float min, float max) {
  if (v < min || v > max) return ST77XX_RED;
  if (v < min + (max-min)*0.2 || v > max - (max-min)*0.2) return ST77XX_ORANGE;
  return ST77XX_GREEN;
}

/* ================= ULTRASON ================= */
float readUltrasonCm() {
  digitalWrite(TRIG_PIN, LOW); delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long d = pulseIn(ECHO_PIN, HIGH, 30000);
  return d > 0 ? d * 0.034f / 2.0f : -1;
}

/* ================= DRAW ================= */
void drawBar(int x, int y, int w, float v, float min, float max) {
  int maxFill = w - 2;
  int bw = constrain((int)((v - min) * maxFill / (max - min)), 0, maxFill);
  tft.drawRect(x, y, w, 6, ST77XX_WHITE);
  if (bw > 0) tft.fillRect(x + 1, y + 1, bw, 4, colorByRange(v, min, max));
}

uint16_t globalFishColor(float t, float ph, float ec) {
  if (t < 18 || t > 28 || ph < 6.0 || ph > 7.5 || ec < 400 || ec > 1600)
    return ST77XX_RED;
  if (t < 20 || t > 26 || ph < 6.4 || ph > 7.2)
    return ST77XX_ORANGE;
  return ST77XX_GREEN;
}

void drawFish(int x, int y, uint16_t c) {
  tft.fillCircle(x, y, 8, c);
  tft.fillTriangle(x-8,y, x-16,y-6, x-16,y+6, c);
  tft.fillCircle(x+3, y-3, 2, ST77XX_BLACK);
}

/* ================= MQTT ================= */
void ensureMqtt() {
  while (!mqtt.connected()) {
    if (mqtt.connect(DEVICE_NAME)) {
      Serial.println("MQTT connected");
    } else {
      delay(2000);
    }
  }
}

/* ================= SETUP ================= */
void setup() {
  Serial.begin(115200);

  tft.initR(INITR_BLACKTAB);
  tft.setRotation(1);
  tft.fillScreen(ST77XX_BLACK);

  sensors.begin();
  Wire.begin();
  lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE);

  if (!bmp.begin(0x76)) {
    Serial.println("BMP280 non detecte");
  }

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(500);

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
}

/* ================= LOOP ================= */
void loop() {
  ensureMqtt();
  mqtt.loop();

  sensors.requestTemperatures();
  float t1 = sensors.getTempCByIndex(0);
  float t2 = sensors.getTempCByIndex(1);
  float tAvg = (t1 + t2) / 2.0f;

  float ph  = analogRead(PH_PIN) / 4095.0f * 14.0f;
  float ec  = analogRead(EC_PIN) / 4095.0f * 2000.0f;
  float lux = lightMeter.readLightLevel();
  float lvl = readUltrasonCm();

  float airC = bmp.readTemperature();
  float airK = toKelvin(airC);
  float pressPa = bmp.readPressure();

  /* ===== TFT ===== */
  tft.fillScreen(ST77XX_BLACK);
  tft.setTextSize(2);
  tft.setCursor(5,5);
  tft.print("POND");

  tft.setTextSize(1);
  tft.drawFastHLine(0,28,160,ST77XX_BLUE);

  tft.setCursor(5,32); tft.print("Eau");
  tft.setCursor(5,44); tft.printf("T %.1f/%.1f", t1, t2);
  drawBar(60,56,60,tAvg,18,28);

  tft.setCursor(5,68); tft.printf("pH %.2f", ph);
  drawBar(60,68,60,ph,6.2,7.2);

  tft.setCursor(5,80); tft.printf("EC %.0f", ec);
  drawBar(60,80,60,ec,500,1500);

  tft.setCursor(5,92); tft.printf("Lux %.0f", lux);
  tft.setCursor(5,104); tft.printf("Niv %.1fcm", lvl);
  tft.setCursor(5,116); tft.printf("Air %.1fC", airC);

  drawFish(135, 82, globalFishColor(tAvg, ph, ec));

  /* ===== SignalK Delta ===== */
  String delta =
    "{"
      "\"context\":\"vessels.self\","
      "\"updates\":[{"
        "\"source\":{\"label\":\"esp32-pond\",\"type\":\"sensor\"},"
        "\"values\":["
          "{\"path\":\"environment/inside/pond/water/temperature\",\"value\":" + String(toKelvin(tAvg)) + "},"
          "{\"path\":\"environment/inside/pond/water/ph\",\"value\":" + String(ph) + "},"
          "{\"path\":\"environment/inside/pond/water/conductivity\",\"value\":" + String(ec) + "},"
          "{\"path\":\"environment/inside/pond/water/level\",\"value\":" + String(lvl / 100.0f) + "},"
          "{\"path\":\"environment/inside/pond/light/level\",\"value\":" + String(lux) + "},"
          "{\"path\":\"environment/inside/pond/air/temperature\",\"value\":" + String(airK) + "},"
          "{\"path\":\"environment/inside/pond/air/pressure\",\"value\":" + String(pressPa) + "}"
        "]"
      "}]"
    "}";

  mqtt.publish("signalk/delta", delta.c_str());

  delay(2000);
}
