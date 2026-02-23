[![License](https://img.shields.io/badge/License-Apache%202.0-brightgreen.svg)](https://opensource.org/licenses/Apache-2.0)
[![SignalK](https://img.shields.io/badge/SignalK-integrated-blue.svg)](https://signalk.org/)
[![ESP32](https://img.shields.io/badge/ESP32-Arduino-orange.svg)](https://www.espressif.com/)

🌍 *[English](README.md)*

![POI Laboratory Logo](logo.png)

# SignalK ESP32 Pond Sensor

Système de monitoring de bassin extérieur / aquaponie basé sur ESP32, avec affichage TFT local et publication vers SignalK via MQTT.

![POI Laboratory Badge](badge.png)

Ce projet contient trois sous-projets :

- **signalk_esp_pond_sensor/** — Firmware principal ESP32 pour les capteurs (Arduino C++)
- **signalk_esp_pond_video/** — Firmware ESP32-CAM pour le streaming vidéo (Arduino C++)
- **signalk-poi-lab/** — Webapp SignalK de monitoring (Next.js)

## Architecture

![Diagramme d'Architecture](architecture.png)

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

## Matériel & Capteurs

![Installation du capteur POI](poi_sensor.jpg)
*Module capteur principal avec TTGO T-Display*

![Installation du capteur POI vue 2](poi_sensor2.jpg)
*Détails du câblage et du boîtier*

![Caméra POI](poi_cam.jpg)
*Module ESP32-CAM pour la surveillance vidéo du bassin en direct*

| Capteur | Mesure | Interface |
|---------|--------|-----------|
| DS18B20 x2 | Temperature eau | 1-Wire (GPIO 27) |
| Sonde pH | pH | Analogique (GPIO 33) |
| Sonde EC | Conductivite | Analogique (GPIO 32) |
| HC-SR04 | Niveau d'eau | GPIO 25/26 |
| BH1750 | Luminosite (lux) | I2C |
| BME280/BMP280 | Temperature air, humidité, pression | I2C |
| ESP32-CAM | Flux vidéo en direct | WiFi (HTTP Stream) |

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
| Humidité de l'air | `environment.outside.relativeHumidity` |
| Pression | `environment.inside.pond.pressure` |

## Installation du firmware

### Configuration du capteur principal

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

`config.h` est ignoré par Git (contient des secrets).

### Configuration de la caméra

```bash
cp signalk_esp_pond_video/config.h.sample signalk_esp_pond_video/config.h
```

Éditez le fichier `config.h` de la caméra de la même manière.

### Dépendances Arduino (Capteur principal)

- WiFi (ESP32 core)
- PubSubClient
- Adafruit GFX + Adafruit ST7789
- OneWire + DallasTemperature
- BH1750
- Adafruit BME280 / BMP280

### Upload

Flasher via Arduino IDE ou PlatformIO sur un ESP32 (TTGO T-Display recommandé pour le capteur principal, module ESP32-CAM pour la vidéo).

## Webapp POI Laboratory

Voir [signalk-poi-lab/README.md](signalk-poi-lab/README.md).

## Licence

Apache-2.0
