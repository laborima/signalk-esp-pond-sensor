#include <WiFi.h>
#include <PubSubClient.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7735.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Wire.h>
#include <BH1750.h>
#include <Adafruit_BMP280.h> // CAPTEUR PRESSURE/TEMP AIR
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
Adafruit_BMP280 bmp; // CAPTEUR AIR

/* ================= NETWORK ================= */
WiFiClient espClient;
PubSubClient mqtt(espClient);

/* ================= UI ================= */
unsigned long lastAnim = 0;
int fishX = 10;
int fishDir = 1;

/* ================= UTILS ================= */
uint16_t colorByRange(float v, float min, float max) {
  if (v < min || v > max) return ST77XX_RED;
  if (v < min + (max-min)*0.2 || v > max - (max-min)*0.2) return ST77XX_ORANGE;
  return ST77XX_GREEN;
}

/* ================= ULTRASON ================= */
float readUltrason() {
  digitalWrite(TRIG_PIN, LOW); delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long d = pulseIn(ECHO_PIN, HIGH, 30000);
  return d * 0.034 / 2;
}

float mapFloat(float value, float inMin, float inMax, float outMin, float outMax) {
  if (inMax <= inMin) {
    return outMin;
  }
  return (value - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;
}

void drawBar(int x, int y, int w, float v, float min, float max) {
  int maxFill = w - 2;
  int bw = (int)constrain(mapFloat(v, min, max, 0, (float)maxFill), 0.0f, (float)maxFill);
  tft.drawRect(x, y, w, 6, ST77XX_WHITE);
  if (bw > 0) {
    tft.fillRect(x + 1, y + 1, bw, 4, colorByRange(v, min, max));
  }
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


/* ================= SETUP ================= */
void setup() {
  Serial.begin(115200);

  tft.initR(INITR_BLACKTAB);
  tft.setRotation(1);
  tft.fillScreen(ST77XX_BLACK);

  sensors.begin();
  Wire.begin();
  lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE);

  if (!bmp.begin(0x76)) { // Adresse I2C BMP280
    Serial.println("BMP280 non detecte !");
  }

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(500);

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
}

/* ================= LOOP ================= */
void loop() {
  if (!mqtt.connected()) mqtt.connect(DEVICE_NAME);
  mqtt.loop();

  sensors.requestTemperatures();
  float temp1 = sensors.getTempCByIndex(0);
  float temp2 = sensors.getTempCByIndex(1);
  float tempAvg = (temp1 + temp2) / 2.0f;
  float ph   = (analogRead(PH_PIN)/4095.0)*14.0;
  float ec   = (analogRead(EC_PIN)/4095.0)*2000.0;
  float lux  = lightMeter.readLightLevel();
  float lvl  = readUltrason();

  float airT = bmp.readTemperature();
  float press = bmp.readPressure()/100.0F;

  tft.fillScreen(ST77XX_BLACK);

  // HEADER
  tft.setTextSize(2);
  tft.setCursor(5,5);
  tft.setTextColor(ST77XX_WHITE);
  tft.print("AQUAPONIE");

  tft.setTextSize(1);
  tft.drawFastHLine(0,28,160,ST77XX_BLUE);

  // WATER
  tft.setCursor(5,32); tft.print("Eau");
  tft.setCursor(5,44); tft.printf("T1 %.1f T2 %.1f", temp1, temp2);
  drawBar(60,56,60,tempAvg,18,28);

  tft.setCursor(5,68); tft.printf("pH %.2f", ph);
  drawBar(60,68,60,ph,6.2,7.2);

  tft.setCursor(5,80); tft.printf("EC %.0f", ec);
  drawBar(60,80,60,ec,500,1500);

  // ENV
  tft.setCursor(5,92); tft.printf("Lux %.0f", lux);
  tft.setCursor(5,104); tft.printf("Niv %.1fcm", lvl);

  tft.setCursor(5,116);
  tft.printf("Air %.1fC %dhPa", airT, (int)press);

  // FISH
  uint16_t fishColor = globalFishColor(tempAvg, ph, ec);
  drawFish(135, 82, fishColor);

  // MQTT
  String payload =
    "{\"temp_water\":"+String(tempAvg)+
    ",\"temp_water_1\":"+String(temp1)+
    ",\"temp_water_2\":"+String(temp2)+
    ",\"ph\":"+String(ph)+
    ",\"ec\":"+String(ec)+
    ",\"lux\":"+String(lux)+
    ",\"level\":"+String(lvl)+
    ",\"temp_air\":"+String(airT)+
    ",\"pressure\":"+String(press)+"}";

  mqtt.publish("sensors/bassin/data", payload.c_str());

  delay(2000);
}

