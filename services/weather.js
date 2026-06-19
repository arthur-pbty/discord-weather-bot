'use strict';

const axios = require('axios');

// ─── Cache ─────────────────────────────────────────────────────────────────────
let cache = { data: null, ts: null };
const CACHE_MS = () => (parseInt(process.env.CACHE_MINUTES, 10) || 10) * 60 * 1000;

// ─── Appel API principal ────────────────────────────────────────────────────────
async function fetchWeatherData() {
  const now = Date.now();
  if (cache.data && cache.ts && now - cache.ts < CACHE_MS()) {
    if (process.env.DEBUG_METEO === 'true') console.log('[cache] Données météo en cache');
    return cache.data;
  }

  const lat = process.env.LAT;
  const lon = process.env.LON;
  if (!lat || !lon) throw new Error('LAT et LON manquants dans .env');

  const hourlyVars = [
    'temperature_2m', 'apparent_temperature', 'relative_humidity_2m',
    'wind_speed_10m', 'wind_gusts_10m', 'wind_direction_10m',
    'precipitation', 'precipitation_probability', 'rain', 'snowfall', 'showers',
    'pressure_msl', 'cloud_cover', 'cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high',
    'visibility', 'uv_index', 'weather_code',
  ].join(',');

  const dailyVars = [
    'temperature_2m_max', 'temperature_2m_min',
    'apparent_temperature_max', 'apparent_temperature_min',
    'precipitation_sum', 'precipitation_probability_max',
    'wind_speed_10m_max', 'wind_gusts_10m_max',
    'uv_index_max', 'sunrise', 'sunset', 'weather_code',
  ].join(',');

  const currentVars = [
    'temperature_2m', 'apparent_temperature', 'relative_humidity_2m',
    'wind_speed_10m', 'wind_gusts_10m', 'wind_direction_10m',
    'precipitation', 'rain', 'snowfall', 'weather_code',
    'pressure_msl', 'cloud_cover', 'visibility', 'uv_index', 'is_day',
  ].join(',');

  const baseParams = {
    latitude: lat,
    longitude: lon,
    timezone: 'Europe/Paris',
    wind_speed_unit: 'kmh',
    forecast_days: 2,
    past_days: 1,
  };

  // Appels parallèles : météo principale + marine
  const [weatherRes, marineRes] = await Promise.allSettled([
    axios.get('https://api.open-meteo.com/v1/forecast', {
      params: { ...baseParams, current: currentVars, hourly: hourlyVars, daily: dailyVars },
      timeout: 10000,
    }),
    axios.get('https://marine-api.open-meteo.com/v1/marine', {
      params: {
        ...baseParams,
        hourly: 'wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction',
        daily: 'wave_height_max,swell_wave_height_max',
      },
      timeout: 8000,
    }),
  ]);

  if (weatherRes.status === 'rejected') {
    throw new Error(`Open-Meteo inaccessible : ${weatherRes.reason?.message}`);
  }

  const weather = weatherRes.value.data;
  const marine = marineRes.status === 'fulfilled' ? marineRes.value.data : null;

  if (process.env.DEBUG_METEO === 'true') {
    console.log('[debug] current:', JSON.stringify(weather.current, null, 2));
    if (marine) console.log('[debug] marine disponible');
  }

  const result = { weather, marine, fetchedAt: new Date() };
  cache = { data: result, ts: now };
  return result;
}

// ─── Invalidation manuelle du cache ───────────────────────────────────────────
function invalidateCache() {
  cache = { data: null, ts: null };
}

// ─── Index de l'heure courante dans les données horaires ──────────────────────
function getCurrentHourIndex(hourlyTimes) {
  // Open-Meteo renvoie les heures en heure locale Paris (ex: "2024-06-10T14:00")
  // On génère la même chaîne à partir de l'heure Paris actuelle
  const nowParis = new Date().toLocaleString('sv', { timeZone: 'Europe/Paris' });
  // format: "YYYY-MM-DD HH:MM:SS"
  const parisHourPrefix = nowParis.substring(0, 13).replace(' ', 'T'); // "YYYY-MM-DDTHH"

  let best = 0;
  for (let i = 0; i < hourlyTimes.length; i++) {
    if (hourlyTimes[i].startsWith(parisHourPrefix)) return i;
    if (hourlyTimes[i] < `${parisHourPrefix}:59`) best = i;
  }
  return best;
}

// ─── Fenêtre des prochaines N heures depuis maintenant ────────────────────────
function getNextHoursWindow(hourlyTimes, count = 24) {
  const start = getCurrentHourIndex(hourlyTimes);
  const end = Math.min(start + count, hourlyTimes.length);
  return { start, end };
}

// ─── Index du jour courant dans les tableaux daily ────────────────────────────
function getTodayDailyIndex(dailyTimes) {
  // avec past_days:1, index 0 = hier, 1 = aujourd'hui, 2 = demain
  const todayParis = new Date().toLocaleString('sv', { timeZone: 'Europe/Paris' }).substring(0, 10);
  const idx = dailyTimes.findIndex(d => d === todayParis);
  return idx >= 0 ? idx : 1; // fallback à 1 (aujourd'hui)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function celsiusToKelvin(c) {
  return (c + 273.15).toFixed(2);
}

function getWindDirection(deg) {
  if (deg == null) return 'N/A';
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO'];
  return dirs[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
}

function getWeatherDescription(code) {
  const map = {
    0: '☀️ Ciel dégagé',
    1: '🌤️ Peu nuageux',
    2: '⛅ Partiellement nuageux',
    3: '☁️ Couvert',
    45: '🌫️ Brouillard',
    48: '🌫️ Brouillard givrant',
    51: '🌦️ Bruine légère',
    53: '🌦️ Bruine modérée',
    55: '🌧️ Bruine dense',
    61: '🌧️ Pluie légère',
    63: '🌧️ Pluie modérée',
    65: '🌧️ Pluie forte',
    71: '🌨️ Neige légère',
    73: '🌨️ Neige modérée',
    75: '❄️ Neige forte',
    77: '🌨️ Grésil',
    80: '🌦️ Averses légères',
    81: '🌧️ Averses modérées',
    82: '⛈️ Averses violentes',
    85: '🌨️ Averses de neige',
    86: '❄️ Averses de neige fortes',
    95: '⛈️ Orage',
    96: '⛈️ Orage avec grêle',
    99: '⛈️ Orage avec grêle forte',
  };
  return map[code] ?? `Code météo ${code}`;
}

function getEmbedColor(code) {
  if (code === 0) return 0xFFD700;
  if (code <= 2)  return 0x87CEEB;
  if (code <= 3)  return 0x708090;
  if (code <= 48) return 0x9E9E9E;
  if (code <= 55) return 0x90CAF9;
  if (code <= 65) return 0x2196F3;
  if (code <= 77) return 0xB0C4DE;
  if (code <= 82) return 0x42A5F5;
  return 0x7B1FA2; // orages
}

function getPressureTendency(hourlyPressure, currentIdx) {
  if (currentIdx < 3) return '→ Stable';
  const diff = hourlyPressure[currentIdx] - hourlyPressure[currentIdx - 3];
  if (diff > 2)  return '↑ En hausse';
  if (diff < -2) return '↓ En baisse';
  return '→ Stable';
}

function getVisibilityLabel(vis) {
  if (vis == null) return 'N/A';
  const km = vis / 1000;
  if (km >= 20)  return '✨ Excellente';
  if (km >= 10)  return '👍 Bonne';
  if (km >= 5)   return '😶‍🌫️ Correcte';
  if (km >= 2)   return '⚠️ Réduite';
  if (km >= 1)   return '🟠 Mauvaise';
  return '🔴 Brouillard';
}

function knotsFromKmh(kmh) {
  if (kmh == null) return 'N/A';
  return (kmh / 1.852).toFixed(1);
}

function getUvLabel(uv) {
  if (uv == null) return 'N/A';
  if (uv <= 2)  return '🟢 Faible';
  if (uv <= 5)  return '🟡 Modéré';
  if (uv <= 7)  return '🟠 Élevé';
  if (uv <= 10) return '🔴 Très élevé';
  return '🟣 Extrême';
}

// ─── Détection d'alertes météo extrêmes ───────────────────────────────────────
function checkAlerts(current, todayDaily) {
  const alerts = [];

  const wind = current.wind_speed_10m;
  const gusts = current.wind_gusts_10m;
  const rain = current.precipitation;
  const code = current.weather_code;
  const vis = current.visibility;

  if (wind >= 90)       alerts.push({ lvl: '🔴', msg: `Vent violent : **${wind} km/h**` });
  else if (wind >= 65)  alerts.push({ lvl: '🟠', msg: `Vent fort : **${wind} km/h**` });
  else if (wind >= 50)  alerts.push({ lvl: '🟡', msg: `Vent modéré-fort : **${wind} km/h**` });

  if (gusts >= 110)     alerts.push({ lvl: '🔴', msg: `Rafales extrêmes : **${gusts} km/h**` });
  else if (gusts >= 80) alerts.push({ lvl: '🟠', msg: `Rafales fortes : **${gusts} km/h**` });

  if (rain >= 15)       alerts.push({ lvl: '🔴', msg: `Pluie torrentielle : **${rain} mm/h**` });
  else if (rain >= 7)   alerts.push({ lvl: '🟠', msg: `Fortes précipitations : **${rain} mm/h**` });

  if (code >= 95)       alerts.push({ lvl: '🔴', msg: `Orage en cours ⛈️` });

  const snowDaily = todayDaily?.precipitation_sum;
  if (current.snowfall >= 1) alerts.push({ lvl: '🟡', msg: `Chutes de neige en cours ❄️` });

  if (vis != null && vis < 500)   alerts.push({ lvl: '🔴', msg: `Visibilité quasi nulle : **${(vis/1000).toFixed(1)} km**` });
  else if (vis != null && vis < 1500) alerts.push({ lvl: '🟠', msg: `Brouillard dense : **${(vis/1000).toFixed(1)} km**` });

  return alerts;
}

module.exports = {
  fetchWeatherData,
  invalidateCache,
  getCurrentHourIndex,
  getNextHoursWindow,
  getTodayDailyIndex,
  celsiusToKelvin,
  getWindDirection,
  getWeatherDescription,
  getEmbedColor,
  getPressureTendency,
  getVisibilityLabel,
  getUvLabel,
  knotsFromKmh,
  checkAlerts,
};
