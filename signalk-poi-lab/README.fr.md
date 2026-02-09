[![License](https://img.shields.io/badge/License-Apache%202.0-brightgreen.svg)](https://opensource.org/licenses/Apache-2.0)
[![SignalK](https://img.shields.io/badge/SignalK-webapp-blue.svg)](https://signalk.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)

🌍 *[English](README.md)*

# POI Laboratory

Webapp SignalK pour le monitoring en temps reel d'un bassin a poissons / aquaponie.

## Fonctionnalites

- **Monitoring temps reel** — temperature, pH, conductivite, niveau d'eau, luminosite
- **Conditions atmospheriques** — temperature air, humidite, pression
- **Score de sante** — evaluation globale de l'ecosysteme
- **Conseils** — recommandations basees sur les conditions actuelles
- **Recommandations** — poissons, plantes aquatiques et potager aquaponie adaptes
- **Donnees calculees** — O2 dissous estime, point de rosee, risques algues
- **PWA** — installable sur mobile

## Donnees SignalK

Donnees publiees par le capteur ESP32 via MQTT :

| Path SignalK | Description |
|---|---|
| `tanks.liveWell.pond.temperature` | Temperature eau moyenne |
| `tanks.liveWell.pond1.temperature` | Temperature sonde 1 |
| `tanks.liveWell.pond2.temperature` | Temperature sonde 2 |
| `tanks.liveWell.pond.ph` | pH |
| `tanks.liveWell.pond.conductivity` | Conductivite (uS/cm) |
| `tanks.liveWell.pond.currentLevel` | Niveau d'eau (m) |
| `environment.inside.pond.illuminance` | Luminosite (lux) |
| `environment.inside.pond.temperature` | Temperature air |
| `environment.inside.pond.pressure` | Pression (Pa) |

## Installation

```bash
npm install
npm run dev
```

## Configuration

Fichier `.env.local` optionnel :

```bash
# URL du serveur SignalK (vide = utilise l'origine de la page)
NEXT_PUBLIC_SIGNALK_URL=http://192.168.x.x:3000
```

## Deploiement SignalK

```bash
npm run build
# Copier out/ dans le repertoire webapps SignalK
```

Ou via le script de deploiement :

```bash
cd ../../chatel-signalk-weatherprovider
./deploy-signalk.sh --poi-lab
```

## Stack

- **Next.js 16** (React 19) — export statique
- **Tailwind CSS 4**
- **basePath** : `/signalk-poi-lab`

## Licence

Apache-2.0
