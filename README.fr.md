[![License](https://img.shields.io/badge/License-Apache%202.0-brightgreen.svg)](https://opensource.org/licenses/Apache-2.0)
[![SignalK](https://img.shields.io/badge/SignalK-integrated-blue.svg)](https://signalk.org/)
[![ESP32](https://img.shields.io/badge/ESP32-Arduino-orange.svg)](https://www.espressif.com/)

🌍 *[English](README.md)*

# SignalK ESP32 Pond Sensor

Systeme de monitoring de bassin exterieur / aquaponie base sur ESP32, avec affichage TFT local et publication vers SignalK via MQTT.

Ce projet contient deux sous-projets :

- **signalk_esp_pond_sensor/** — firmware ESP32 (Arduino C++)
- **signalk-poi-lab/** — webapp SignalK de monitoring (Next.js)

## Architecture

```text
[ Capteurs eau & air ]
        |
        | (Analogique / I2C / 1-Wire)
        v
    ESP32 (TTGO T-Display)
        |
        |-- SPI  -> Ecran TFT 135x240 (ST7789)
        |-- WiFi -> MQTT -> SignalK Server
        |                       |
        |                       v
        |                  signalk-poi-lab (webapp)
        |-- Standby 20h-7h (ecran eteint)
        '-- Watchdog 30s
```

## Capteurs

| Capteur | Mesure | Interface |
|---------|--------|-----------|
| DS18B20 x2 | Temperature eau | 1-Wire (GPIO 27) |
| Sonde pH | pH | Analogique (GPIO 33) |
| Sonde EC | Conductivite | Analogique (GPIO 32) |
| HC-SR04 | Niveau d'eau | GPIO 25/26 |
| BH1750 | Luminosite (lux) | I2C |
| BME280/BMP280 | Temperature air, pression | I2C |

## Paths SignalK

| Mesure | Path |
|--------|------|
| Temperature eau (moyenne) | `tanks.liveWell.pond.temperature` |
| Temperature sonde 1 | `tanks.liveWell.pond1.temperature` |
| Temperature sonde 2 | `tanks.liveWell.pond2.temperature` |
| pH | `tanks.liveWell.pond.ph` |
| Conductivite | `tanks.liveWell.pond.conductivity` |
| Niveau d'eau | `tanks.liveWell.pond.currentLevel` |
| Luminosite | `environment.inside.pond.illuminance` |
| Temperature air | `environment.inside.pond.temperature` |
| Pression | `environment.inside.pond.pressure` |

## Installation du firmware

### Configuration

```bash
cp signalk_esp_pond_sensor/config.h.sample signalk_esp_pond_sensor/config.h
```

Editez `config.h` avec vos identifiants WiFi et l'adresse du broker MQTT :

```c
#define WIFI_SSID     "MON_WIFI"
#define WIFI_PASS     "MON_MDP"
#define MQTT_HOST     "192.168.x.x"
#define MQTT_PORT     1883
#define DEVICE_NAME   "signalk-esp-pond-sensor-01"
```

`config.h` est ignore par Git (contient des secrets).

### Dependances Arduino

- WiFi (ESP32 core)
- PubSubClient
- Adafruit GFX + Adafruit ST7789
- OneWire + DallasTemperature
- BH1750
- Adafruit BME280 / BMP280

### Upload

Flasher via Arduino IDE ou PlatformIO sur un ESP32 (TTGO T-Display recommande).

## Webapp POI Laboratory

Voir [signalk-poi-lab/README.md](signalk-poi-lab/README.md).

## Licence

Apache-2.0
