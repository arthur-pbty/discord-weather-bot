'use strict';

const axios = require('axios');

// ─── Cache journalier ─────────────────────────────────────────────────────────
let astroCache = { data: null, date: null };

// ─── Calcul de la phase lunaire (algorithme Julian Date) ─────────────────────
function getMoonPhase(date = new Date()) {
  // Conversion en Jour Julien (JD)
  let y = date.getFullYear();
  let m = date.getMonth() + 1;
  const d = date.getDate();

  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  const jd = Math.floor(365.25 * (y + 4716))
           + Math.floor(30.6001 * (m + 1))
           + d + B - 1524.5;

  // Nouvelle lune de référence : 6 janvier 2000 à 18h14 UTC → JD 2451549.759
  const REF_NEW_MOON  = 2451549.759;
  const SYNODIC_PERIOD = 29.53058867; // jours

  let daysSinceNew = (jd - REF_NEW_MOON) % SYNODIC_PERIOD;
  if (daysSinceNew < 0) daysSinceNew += SYNODIC_PERIOD;

  const fraction = daysSinceNew / SYNODIC_PERIOD;

  // Illumination (0–100 %)
  const illumination = Math.round((1 - Math.cos(2 * Math.PI * fraction)) / 2 * 100);

  // Nom & emoji de la phase
  let phaseName, phaseEmoji;
  if      (fraction < 0.0625) { phaseName = 'Nouvelle lune';         phaseEmoji = '🌑'; }
  else if (fraction < 0.1875) { phaseName = 'Croissant montant';     phaseEmoji = '🌒'; }
  else if (fraction < 0.3125) { phaseName = 'Premier quartier';      phaseEmoji = '🌓'; }
  else if (fraction < 0.4375) { phaseName = 'Gibbeuse croissante';   phaseEmoji = '🌔'; }
  else if (fraction < 0.5625) { phaseName = 'Pleine lune';           phaseEmoji = '🌕'; }
  else if (fraction < 0.6875) { phaseName = 'Gibbeuse décroissante'; phaseEmoji = '🌖'; }
  else if (fraction < 0.8125) { phaseName = 'Dernier quartier';      phaseEmoji = '🌗'; }
  else if (fraction < 0.9375) { phaseName = 'Croissant décroissant'; phaseEmoji = '🌘'; }
  else                         { phaseName = 'Nouvelle lune';         phaseEmoji = '🌑'; }

  return { phaseName, phaseEmoji, illumination, daysInCycle: daysSinceNew.toFixed(1) };
}

// ─── Formatage d'une heure UTC ISO → heure Paris HH:MM ──────────────────────
function fmtTime(isoString) {
  if (!isoString) return 'N/A';
  return new Date(isoString).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  });
}

// ─── Durée en secondes → "Xh YYmin" ─────────────────────────────────────────
function fmtDuration(seconds) {
  if (!seconds) return 'N/A';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}min`;
}

// ─── Fetch astronomie (Sunrise-Sunset API + fallback Open-Meteo) ──────────────
async function fetchAstronomyData(lat, lon, fallbackDaily = null) {
  const todayStr = new Date().toLocaleDateString('sv', { timeZone: 'Europe/Paris' });

  if (astroCache.data && astroCache.date === todayStr) {
    return astroCache.data;
  }

  const moon = getMoonPhase(new Date());
  let result;

  try {
    const res = await axios.get('https://api.sunrise-sunset.org/json', {
      params: { lat, lng: lon, date: todayStr, formatted: 0 },
      timeout: 6000,
    });

    const r = res.data.results;
    result = {
      sunrise:    fmtTime(r.sunrise),
      sunset:     fmtTime(r.sunset),
      solar_noon: fmtTime(r.solar_noon),
      day_length: fmtDuration(r.day_length),
      moon,
      source: 'Sunrise-Sunset.org',
    };
  } catch (err) {
    console.warn(`[astro] Sunrise-Sunset API indisponible (${err.message}), fallback Open-Meteo`);

    // Fallback : Open-Meteo daily contient sunrise/sunset (en heure locale ISO)
    if (fallbackDaily) {
      const todayIdx = fallbackDaily.time.findIndex(d => d === todayStr);
      const i = todayIdx >= 0 ? todayIdx : 0;
      const sr = fallbackDaily.sunrise?.[i];
      const ss = fallbackDaily.sunset?.[i];

      // Open-Meteo renvoie "2024-06-10T06:24" (heure locale), pas UTC
      const fmtLocal = (s) => s ? s.substring(11, 16) : 'N/A';

      let dayLengthSec = null;
      if (sr && ss) {
        const [sh, sm] = fmtLocal(sr).split(':').map(Number);
        const [eh, em] = fmtLocal(ss).split(':').map(Number);
        dayLengthSec = (eh * 60 + em - sh * 60 - sm) * 60;
      }

      result = {
        sunrise:    fmtLocal(sr),
        sunset:     fmtLocal(ss),
        solar_noon: 'N/A',
        day_length: fmtDuration(dayLengthSec),
        moon,
        source: 'Open-Meteo (fallback)',
      };
    } else {
      result = {
        sunrise: 'N/A', sunset: 'N/A', solar_noon: 'N/A', day_length: 'N/A',
        moon,
        source: 'Indisponible',
      };
    }
  }

  astroCache = { data: result, date: todayStr };
  return result;
}

// ─── Invalidation du cache astronomie ────────────────────────────────────────
function invalidateAstroCache() {
  astroCache = { data: null, date: null };
}

// ─── Calcul de l'élévation solaire (algorithme NOAA simplifié) ───────────────
function getSolarElevation(lat, lon, dateUTC) {
  const toRad = d => d * Math.PI / 180;
  const toDeg = r => r * 180 / Math.PI;

  const y = dateUTC.getUTCFullYear();
  const m = dateUTC.getUTCMonth() + 1;
  const dd = dateUTC.getUTCDate();
  const hh = dateUTC.getUTCHours() + dateUTC.getUTCMinutes() / 60;

  // Julian Day
  let yj = y, mj = m;
  if (mj <= 2) { yj -= 1; mj += 12; }
  const A = Math.floor(yj / 100);
  const B = 2 - A + Math.floor(A / 4);
  const JD = Math.floor(365.25 * (yj + 4716)) + Math.floor(30.6001 * (mj + 1)) + dd + B - 1524.5 + hh / 24;
  const n = JD - 2451545.0; // jours depuis J2000

  // Longitude du Soleil & anomalie moyenne
  const L = ((280.460 + 0.9856474 * n) % 360 + 360) % 360;
  const g = toRad(((357.528 + 0.9856003 * n) % 360 + 360) % 360);

  // Longitude écliptique
  const lambda = toRad(L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g));

  // Obliquité de l'écliptique
  const eps = toRad(23.439 - 0.0000004 * n);

  // Déclinaison & ascension droite
  const sinDec = Math.sin(eps) * Math.sin(lambda);
  const dec = Math.asin(sinDec);
  const RA_h = toDeg(Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda))) / 15;

  // Temps sidéral de Greenwich (heures)
  const GMST = ((6.697375 + 0.0657098242 * n + hh) % 24 + 24) % 24;

  // Angle horaire local
  const LST = (GMST + lon / 15 + 24) % 24;
  const H = toRad((LST - RA_h) * 15);

  // Altitude (élévation)
  const latR = toRad(parseFloat(lat));
  const sinAlt = Math.sin(latR) * Math.sin(dec) + Math.cos(latR) * Math.cos(dec) * Math.cos(H);
  return toDeg(Math.asin(Math.max(-1, Math.min(1, sinAlt))));
}

// Tableau 25 valeurs horaires (élévation, peut être négatif = nuit)
function getSolarElevationForDay(lat, lon, startTime, count = 25) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = new Date(startTime.getTime() + i * 3600_000);
    out.push(parseFloat(getSolarElevation(lat, lon, t).toFixed(1)));
  }
  return out;
}

// ─── Marées harmoniques (côte atlantique française — approximation) ───────────
// Constituants calibrés sur la zone Lacanau-Arcachon (SHOM approx.)
const TIDAL_CONSTITUENTS = [
  // [amplitude_m, vitesse_°/h, phase_°]
  [1.42, 28.9841042, 288],  // M2 - Lunaire semi-diurne principal
  [0.50, 30.0000000, 330],  // S2 - Solaire semi-diurne principal
  [0.28, 28.4397295, 270],  // N2 - Lunaire elliptique majeure
  [0.10, 15.0410686, 48 ],  // K1 - Luni-solaire diurne
  [0.09, 13.9430356, 358],  // O1 - Lunaire diurne principal
  [0.05, 30.0821373, 335],  // K2 - Luni-solaire semi-diurne
  [0.04, 28.5125831, 272],  // L2 - Lunaire elliptique mineure
];
const J2000_MS = 946727935816; // 1er jan 2000 12h00 UTC en ms

function calculateTideHeight(timestampMs) {
  const t = (timestampMs - J2000_MS) / 3_600_000; // heures depuis J2000
  const toRad = d => d * Math.PI / 180;
  return TIDAL_CONSTITUENTS.reduce((h, [amp, speed, phase]) => {
    return h + amp * Math.cos(toRad(speed * t - phase));
  }, 0);
}

function getTideForDay(startTime, count = 25) {
  return Array.from({ length: count }, (_, i) => {
    const t = new Date(startTime.getTime() + i * 3_600_000);
    return parseFloat(calculateTideHeight(t.getTime()).toFixed(2));
  });
}

module.exports = {
  fetchAstronomyData,
  getMoonPhase,
  invalidateAstroCache,
  getSolarElevation,
  getSolarElevationForDay,
  calculateTideHeight,
  getTideForDay,
};
