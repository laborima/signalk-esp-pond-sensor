# 🌿 Système de monitoring de bassin / aquaponie – ESP32

Projet DIY de supervision d’un **bassin extérieur / aquaponie / piscine naturelle**, basé sur **ESP32**, avec :

* affichage local sur écran TFT
* envoi des données vers **SignalK** via Wi-Fi / MQTT
* intégration possible avec Grafana, Home Assistant et dashboards custom

Le *vessel SignalK* représente la **maison** ; le bassin est isolé dans la zone
`environment.inside.pond`.

---

## 🎯 Objectifs du projet

* 📊 Mesure continue de la **qualité de l’eau**
* 🌤️ Suivi de l’**environnement extérieur**
* 🖥️ Affichage local lisible (maintenance terrain)
* 🌐 Intégration réseau (SignalK / MQTT)
* 🧱 Architecture simple, robuste et évolutive
* 🔌 Matériel accessible et remplaçable

---

## 🧠 Architecture générale

```text
[ Capteurs eau & air ]
          │
          │ (Analogique / I2C / 1-Wire)
          ▼
      ESP32 Dev Board
          │
          ├── SPI  → Écran TFT (affichage local)
          ├── Wi-Fi → MQTT → SignalK
          └── Alimentation 5V / 3.3V
```

---

## 📦 Liste complète des composants

### 🔧 Unité centrale

* **ESP32 Dev Board**

  * Wi-Fi intégré
  * ADC 12 bits
  * I2C / SPI / 1-Wire
  * Faible consommation

---

### 🖥️ Affichage

* **Écran TFT SPI** (ST7735 / ST7789 recommandé)

```text
┌────────────────────────┐
│ 🐟 POND MONITOR        │
├────────────────────────┤
│ 🌡 Eau  23.4°C ████    │
│ 💧 pH   6.8   ████    │
│ ⚡ EC   820uS ███     │
│ ☀ Lux  12300           │
│ 📏 Niv  32 cm           │
│ 🌬 Air  18.5°C 1012hPa │
├────────────────────────┤
│        🐠              │
└────────────────────────┘
```

---

### 💧 Capteurs eau

| Capteur    | Paramètre mesuré                 | Signal           |
| ---------- | -------------------------------- | ---------------- |
| Sonde pH   | Acidité / alcalinité             | Analogique (ADC) |
| Sonde EC   | Conductivité (sels / nutriments) | Analogique (ADC) |
| DS18B20 x2 | Température de l’eau             | 1-Wire           |
| HC-SR04    | Niveau d’eau                     | Numérique        |

---

### 🌤️ Capteurs environnement

| Capteur | Paramètre              | Bus |
| ------- | ---------------------- | --- |
| BH1750  | Luminosité (lux)       | I2C |
| BMP280  | Pression atmosphérique | I2C |
| BMP280  | Température air        | I2C |

---

## 🔌 Schéma de montage

Schéma fonctionnel **réaliste**, prêt pour breadboard ou carte proto.


```text
                 ┌─────────────────────────┐
                 │         ESP32            │
                 │                         │
                 │ 3V3 ─────────┬─────────┬─────────┐
                 │ GND ─────────┴────┬────┴────┬────┴────┐
                 │                    │         │         │
                 │ GPIO21 (SDA) ──────┼── BH1750│         │
                 │ GPIO22 (SCL) ──────┼── BMP280│         │
                 │                    │         │         │
                 │ GPIO35 (ADC) ◄─────┼── pH    │         │
                 │ GPIO34 (ADC) ◄─────┼── EC    │         │
                 │                    │         │         │
                 │ GPIO27 (1-Wire) ◄──┼── DS18B20 x2│       │
                 │                    │         │         │
                 │ GPIO25 ───────────►┼── Ultrason TRIG   │
                 │ GPIO26 ◄───────────┼── Ultrason ECHO   │
                 │                    │         │         │
                 │ SPI ───────────────┼── TFT Écran       │
                 │ Wi-Fi ─────────────┼── SignalK         │
                 └─────────────────────────┘
```

---

## 🔋 Alimentation

| Élément  | Tension | Remarque                   |
| -------- | ------- | -------------------------- |
| ESP32    | 5V USB  | Régulation 3.3V interne    |
| BH1750   | 3.3V    | I2C natif                  |
| BMP280   | 3.3V    | I2C natif                  |
| DS18B20  | 3.3V    | Pull-up 4.7kΩ              |
| pH       | 5V      | Sortie analogique          |
| EC       | 5V      | Sortie analogique          |
| Ultrason | 5V      | **ECHO à abaisser à 3.3V** |
| TFT      | 3.3V    | SPI                        |

⚠️ **Toutes les masses (GND) doivent être communes.**

---

## 🧮 Fonctionnement logiciel

### 1️⃣ Acquisition

* Lecture cyclique des capteurs
* Moyennage ADC
* Calibration pH / EC
* Conversion vers unités physiques

---

### 2️⃣ Affichage local

* Rafraîchissement TFT
* Diagnostic terrain sans réseau

---

### 3️⃣ Communication réseau

* Connexion Wi-Fi
* Publication MQTT
* Conversion vers **SignalK Delta**

---

## 🔗 Intégration SignalK

### Zone dédiée

Le bassin est isolé dans :

```
/vessels/self/environment/inside/pond
```

---

### Mapping SignalK

| Mesure                  | Path SignalK                                 |
| ----------------------- | -------------------------------------------- |
| Température eau         | `environment.inside.pond.water.temperature`  |
| Température eau sonde 1 | `environment.inside.pond.water.temperature1` |
| Température eau sonde 2 | `environment.inside.pond.water.temperature2` |
| pH                      | `environment.inside.pond.water.ph`           |
| Conductivité            | `environment.inside.pond.water.conductivity` |
| Niveau                  | `environment.inside.pond.water.level`        |
| Luminosité              | `environment.inside.pond.light.level`        |
| Température air         | `environment.inside.pond.air.temperature`    |
| Pression                | `environment.inside.pond.air.pressure`       |
| Humidité relative       | `environment.inside.pond.air.humidity`       |

---

### Exemple **SignalK Delta** (recommandé)

```json
{
  "context": "vessels.self",
  "updates": [
    {
      "source": {
        "label": "esp32-pond",
        "type": "sensor"
      },
      "values": [
        { "path": "environment/inside/pond/water/temperature",  "value": 291.85 },
        { "path": "environment/inside/pond/water/temperature1", "value": 291.65 },
        { "path": "environment/inside/pond/water/temperature2", "value": 292.05 },

        { "path": "environment/inside/pond/water/ph",            "value": 7.2 },
        { "path": "environment/inside/pond/water/conductivity", "value": 1240 },
        { "path": "environment/inside/pond/water/level",        "value": 0.425 },

        { "path": "environment/inside/pond/air/temperature",    "value": 294.45 },
        { "path": "environment/inside/pond/air/pressure",       "value": 101640 },
        { "path": "environment/inside/pond/air/humidity",       "value": 0.62 },

        { "path": "environment/inside/pond/light/level",        "value": 18300 }
      ]
    }
  ]
}

```

📌 Températures en **Kelvin**, pression en **Pa** (conformité SignalK).

---

## ⚙️ Préparation du projet

### Dépendances

* WiFi (ESP32 core)
* PubSubClient
* Adafruit GFX
* Adafruit ST7735 / ST7789
* OneWire
* DallasTemperature
* BH1750
* Adafruit BMP280

---

### Configuration

```bash
cp config.h.sample config.h
```

```c
#define WIFI_SSID   "MON_WIFI"
#define WIFI_PASS   "MON_MDP"
#define MQTT_HOST   "192.168.0.10"
#define MQTT_PORT   1883
#define DEVICE_NAME "esp32-pond-01"
```

`config.h` est ignoré par Git.

---

## 🚀 Évolutions prévues

* ORP / salinité
* Alimentation solaire
* Historisation InfluxDB
* Alertes seuils
* OTA firmware

---

## 🧠 Philosophie

> *Un bassin sain commence par des données fiables.*

Ce projet privilégie :

* la lisibilité
* la robustesse
* la conformité SignalK
* la maintenabilité long terme