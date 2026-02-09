[![License](https://img.shields.io/badge/License-Apache%202.0-brightgreen.svg)](https://opensource.org/licenses/Apache-2.0)
[![SignalK](https://img.shields.io/badge/SignalK-webapp-blue.svg)](https://signalk.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)

🌍 *[Français](README.fr.md)*

# POI Laboratory

SignalK webapp for real-time monitoring of a fish pond / aquaponics system.

## Features

- **Real-time monitoring** — temperature, pH, conductivity, water level, illuminance
- **Atmospheric conditions** — air temperature, humidity, pressure
- **Health score** — overall ecosystem assessment
- **Advice** — recommendations based on current conditions
- **Recommendations** — fish, aquatic plants and aquaponics crops suited to conditions
- **Derived data** — estimated dissolved O2, dew point, algae risk
- **PWA** — installable on mobile

## SignalK Data

Data published by the ESP32 sensor via MQTT:

| SignalK Path | Description |
|---|---|
| `tanks.liveWell.pond.temperature` | Average water temperature |
| `tanks.liveWell.pond1.temperature` | Probe 1 temperature |
| `tanks.liveWell.pond2.temperature` | Probe 2 temperature |
| `tanks.liveWell.pond.ph` | pH |
| `tanks.liveWell.pond.conductivity` | Conductivity (uS/cm) |
| `tanks.liveWell.pond.currentLevel` | Water level (m) |
| `environment.inside.pond.illuminance` | Illuminance (lux) |
| `environment.inside.pond.temperature` | Air temperature |
| `environment.inside.pond.pressure` | Pressure (Pa) |

## Installation

```bash
npm install
npm run dev
```

## Configuration

Optional `.env.local` file:

```bash
# SignalK server URL (empty = use page origin)
NEXT_PUBLIC_SIGNALK_URL=http://192.168.x.x:3000
```

## SignalK Deployment

```bash
npm run build
# Copy out/ to SignalK webapps directory
```

Or via the deploy script:

```bash
cd ../../chatel-signalk-weatherprovider
./deploy-signalk.sh --poi-lab
```

## Stack

- **Next.js 16** (React 19) — static export
- **Tailwind CSS 4**
- **basePath** : `/signalk-poi-lab`

## License

Apache-2.0
