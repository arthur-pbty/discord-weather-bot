# 🌦️ Discord Météo Bot

Bot Discord ultra-complet avec météo temps réel, graphiques et données marines. **Aucune API payante.**

## ✨ Fonctionnalités

| Fonctionnalité | Détails |
|---|---|
| `/meteo` | Rapport complet à la demande |
| ⏰ Message quotidien | Heure configurable via `.env` |
| 📊 5 graphiques | Température, vent, pluie, pression, nuages |
| 🌊 Données marines | Vagues, houle, direction (si côtier) |
| 🌙 Phase lunaire | Calcul local, illumination |
| 🌅 Astronomie | Lever/coucher soleil, durée du jour |
| ⚠️ Alertes météo | Vent fort, pluie intense, orage, brouillard |
| 📊 Comparaison J-1 | Température, pluie, vent vs hier |
| 🔧 Mode debug | Données brutes + diagnostics |
| 💾 Cache 10 min | Évite le spam API |

## 🚀 Installation

### 1. Prérequis
- **Node.js >= 18** — [télécharger](https://nodejs.org)
- Un bot Discord (token + permissions)

### 2. Cloner / télécharger
```bash
# Placer tous les fichiers dans un dossier
cd discord-meteo-bot
npm install
```

### 3. Configurer le bot Discord

1. Aller sur [discord.com/developers/applications](https://discord.com/developers/applications)
2. Créer une nouvelle application → **Bot** → **Reset Token** → copier le token
3. Dans **OAuth2 → URL Generator** :
   - Scopes : `bot`, `applications.commands`
   - Bot Permissions : `Send Messages`, `Embed Links`, `Attach Files`
4. Utiliser le lien généré pour inviter le bot sur votre serveur

### 4. Configurer le `.env`

```bash
cp .env.example .env
# Puis éditer .env avec vos valeurs
```

```env
DISCORD_TOKEN=MTUx...           # Token du bot Discord
CHANNEL_ID=1234567890123456789  # ID du channel (clic droit → Copier l'ID)

SEND_HOUR=7                     # Heure d'envoi du message quotidien
SEND_MINUTE=30                  # Minute d'envoi

LAT=44.6310                     # Latitude
LON=-1.0215                     # Longitude
LOCATION_NAME=Lacanau-Océan     # Nom affiché dans Discord

DEBUG_METEO=false               # true pour le mode debug
CACHE_MINUTES=10                # Durée du cache API
```

> **Activer l'ID Discord** : Paramètres Discord → Avancé → Mode développeur ✅

### 5. Lancer le bot

```bash
# Production
npm start

# Développement (rechargement auto)
npm run dev
```

## 📦 APIs utilisées

| API | Usage | Clé requise |
|---|---|---|
| [Open-Meteo](https://open-meteo.com/) | Météo complète (temp, vent, pluie…) | ❌ Gratuit |
| [Open-Meteo Marine](https://open-meteo.com/en/docs/marine-weather-api) | Vagues, houle | ❌ Gratuit |
| [Sunrise-Sunset.org](https://sunrise-sunset.org/api) | Lever/coucher soleil | ❌ Gratuit |
| [QuickChart.io](https://quickchart.io/) | Génération des graphiques | ❌ Gratuit |
| Phase lunaire | Calcul mathématique local | ❌ Aucune |

## 🏗️ Architecture

```
discord-meteo-bot/
├── index.js                   # Bot principal, cron, routing
├── commands/
│   └── meteo.js               # Commande /meteo + buildEmbed + sendReport
├── services/
│   ├── weather.js             # Open-Meteo API, cache, helpers
│   ├── astronomy.js           # Sunrise-Sunset API, phase lunaire
│   └── charts.js              # Génération graphiques via QuickChart
├── .env                       # Configuration (ne pas committer!)
├── .env.example               # Template
└── package.json
```

## 🎨 Aperçu de l'embed

```
⛅ Partiellement nuageux  —  Lacanau-Océan
22.4°C · Ressenti 20.1°C · 🌞 Jour

🌡️ Températures         💨 Vent              🌧️ Précipitations
Actuelle  : 22.4°C      Vitesse : 28 km/h    Actuelle  : 0.2 mm/h
Ressentie : 20.1°C      Rafales : 41 km/h    Proba.    : 30%
Max / Min : 26°C/14°C   Dir.    : OSO (255°) Pluie     : 0.2 mm/h
Humidité  : 72%         Max     : 52 km/h    Total     : 3.4 mm

🔵 Atmosphère            ☁️ Nuages            👁️ Visibilité
Pression  : 1012 hPa ↓  Total   : 45%        18.0 km
UV Index  : 6 — 🟠 Élevé  Bas     : 30%      👍 Bonne
UV max    : 8           Moyen   : 10%
                        Haut    : 5%

🌅 Astronomie
🌅 Lever : 07:24   🌇 Coucher : 20:48   ☀️ Zénith : 14:06   ⏱️ Durée : 13h24min

🌙 Phase lunaire          🌊 Données marines
🌒 Croissant montant      Hauteur : 1.4 m
Illumination : 38%        Période : 8.5 s
Jour J+4.3                Dir.    : NO (325°)

📊 Comparaison avec hier
Temp max : +1.8°C ↑   Pluie : -2.1 mm ↓   Vent max : +8 km/h ↑
```

Suivi des **5 graphiques** (image séparée) :
- 🌡️ Températures sur 24h
- 💨 Vent sur 24h (vitesse + rafales)
- 🌧️ Précipitations sur 24h (mm + probabilité)
- 🔵 Pression atmosphérique sur 24h
- ☁️ Couverture nuageuse sur 24h (total + bas/moyen/haut)

## ⚙️ Mode Debug

Mettre `DEBUG_METEO=true` dans le `.env` pour ajouter un champ debug à l'embed :
- Heure de mise en cache
- Index horaires courants
- Source des données astronomiques
- Nombre de graphiques générés

## 🔧 Personnalisation rapide

**Changer la fréquence du cache :**
```env
CACHE_MINUTES=15
```

**Forcer deux messages par jour :**
Dupliquer le bloc `cron.schedule()` dans `index.js` avec un deuxième horaire.

**Ajouter une autre localisation :**
Créer un second `.env` ou passer les coordonnées en argument.

## 🐛 Dépannage

| Problème | Solution |
|---|---|
| `Missing Access` | Vérifier les permissions du bot dans le channel |
| Commandes non visibles | Les commandes globales prennent jusqu'à 1h. Réinviter le bot. |
| Graphiques manquants | QuickChart peut être temporairement indisponible — réessayez |
| Marine non disponible | Normal pour les localisations éloignées des côtes |
| `Unknown Channel` | Vérifier le CHANNEL_ID dans .env |

## 📝 Dépendances

```json
{
  "discord.js": "^14.14.1",
  "axios": "^1.6.8",
  "node-cron": "^3.0.3",
  "dotenv": "^16.4.5"
}
```
