'use strict';

// Chargement dynamique pour éviter un crash si @napi-rs/canvas n'est pas installé
let createCanvas, loadImage, GlobalFonts;
try {
  ({ createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas'));
  try { GlobalFonts.loadSystemFonts(); } catch (_) {}
} catch (e) {
  console.warn('[composite] @napi-rs/canvas non disponible — image composite désactivée');
}

const {
  getWeatherDescription, getWindDirection, getVisibilityLabel,
  getUvLabel, knotsFromKmh, getNextHoursWindow, getTodayDailyIndex,
} = require('./weather');

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bg:      '#0f172a',
  section: '#1e293b',
  card:    '#243449',
  border:  '#334155',
  text:    '#e2e8f0',
  dim:     '#94a3b8',
  bright:  '#f8fafc',
  accent:  '#38bdf8',
  orange:  '#fb923c',
  green:   '#4ade80',
  yellow:  '#fbbf24',
  marine:  '#1e3a5c',
  marineB: '#2a5a8c',
  marineT: '#93c5fd',
};

const W     = 1860;
const PAD   = 22;
const GUTTER = 12;

// ─── Helpers canvas ───────────────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r = 10) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

function fillCard(ctx, x, y, w, h, color = C.card, borderColor = C.border, r = 10) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
  roundRect(ctx, x, y, w, h, r);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function txt(ctx, str, x, y, { size = 16, weight = 'normal', color = C.text, align = 'left', max } = {}) {
  ctx.save();
  ctx.font = `${weight} ${size}px sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  if (max) ctx.fillText(String(str ?? ''), x, y, max);
  else     ctx.fillText(String(str ?? ''), x, y);
  ctx.restore();
}

function hline(ctx, y, opacity = 0.5) {
  ctx.save();
  ctx.strokeStyle = C.border;
  ctx.globalAlpha = opacity;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W - PAD, y);
  ctx.stroke();
  ctx.restore();
}

function row(ctx, label, value, x, y, valColor = C.accent) {
  txt(ctx, label, x, y, { size: 14, color: C.dim });
  txt(ctx, value ?? 'N/A', x + 175, y, { size: 14, weight: 'bold', color: valColor, max: 240 });
}

// ─── Génération de l'image composite ─────────────────────────────────────────
async function generateCompositeImage({ weather: wd, marine, astro, charts }) {
  if (!createCanvas) throw new Error('@napi-rs/canvas non installé');

  const w  = wd.weather;
  const c  = w.current;
  const h  = w.hourly;
  const d  = w.daily;
  const loc = process.env.LOCATION_NAME || `${process.env.LAT}°, ${process.env.LON}°`;

  const todayIdx = getTodayDailyIndex(d.time);
  const { start: hIdx } = getNextHoursWindow(h.time);

  // ── Layout dynamique ────────────────────────────────────────────────────────
  const HEADER_H  = 130;
  const SEP       = 14;
  const DATA_H    = 310;   // 2 lignes × 3 cartes
  const ASTRO_H   = 76;
  const MARINE_H  = marine ? 58 : 0;
  const ALERT_H   = 0;     // géré dans DATA section si besoin
  const CHART_H   = 280;
  const CHART_ROWS = 4;    // 8 graphiques / 2 colonnes
  const FOOTER_H  = 52;

  const TOTAL_H = PAD + HEADER_H + SEP + DATA_H + SEP + ASTRO_H + (MARINE_H ? MARINE_H + GUTTER : 0)
                + SEP + CHART_ROWS * (CHART_H + GUTTER) + SEP + FOOTER_H + PAD;

  const canvas = createCanvas(W, TOTAL_H);
  const ctx = canvas.getContext('2d');

  // ── Fond ────────────────────────────────────────────────────────────────────
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, TOTAL_H);

  // Gradient haut
  const grd = ctx.createLinearGradient(0, 0, 0, 220);
  grd.addColorStop(0, 'rgba(56,189,248,0.07)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, 220);

  let Y = PAD;

  // ── HEADER ──────────────────────────────────────────────────────────────────
  // Condition météo
  txt(ctx, getWeatherDescription(c.weather_code), PAD, Y + 36, { size: 26, weight: 'bold', color: C.bright });
  txt(ctx, loc, PAD, Y + 64, { size: 17, color: C.dim });

  // Température (droite)
  txt(ctx, `${c.temperature_2m?.toFixed(1)}°C`, W - PAD, Y + 44, { size: 52, weight: 'bold', color: C.accent, align: 'right' });
  txt(ctx, `Ressenti ${c.apparent_temperature?.toFixed(1)}°C`, W - PAD, Y + 74, { size: 16, color: C.dim, align: 'right' });

  // Date / heure
  const now    = new Date();
  const dateStr = now.toLocaleDateString('fr-FR', { weekday:'long', year:'numeric', month:'long', day:'numeric', timeZone:'Europe/Paris' });
  const timeStr = now.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit', timeZone:'Europe/Paris' });
  txt(ctx, `${dateStr} — ${timeStr}`, PAD, Y + 100, { size: 14, color: C.dim });

  // Ligne sous header
  Y += HEADER_H;
  hline(ctx, Y);
  Y += SEP;

  // ── DATA CARDS (2 lignes × 3 colonnes) ─────────────────────────────────────
  const CW   = (W - PAD * 2 - GUTTER * 2) / 3;
  const CH   = (DATA_H - GUTTER) / 2;
  const R2   = Y + CH + GUTTER;

  const cells = [
    // Ligne 1
    {
      title: 'Temperatures',
      items: [
        ['Actuelle',  `${c.temperature_2m?.toFixed(1)}C  (${(c.temperature_2m + 273.15).toFixed(0)} K)`],
        ['Ressentie', `${c.apparent_temperature?.toFixed(1)}C`],
        ['Max / Min', `${d.temperature_2m_max[todayIdx]}C / ${d.temperature_2m_min[todayIdx]}C`],
        ['Humidite',  `${c.relative_humidity_2m}%`],
      ]
    },
    {
      title: 'Vent',
      items: [
        ['Vitesse',   `${knotsFromKmh(c.wind_speed_10m)} kt  (${c.wind_speed_10m?.toFixed(0)} km/h)`],
        ['Rafales',   `${knotsFromKmh(c.wind_gusts_10m)} kt  (${c.wind_gusts_10m?.toFixed(0)} km/h)`],
        ['Direction', `${getWindDirection(c.wind_direction_10m)} (${c.wind_direction_10m?.toFixed(0)}deg)`],
        ['Max jour',  `${knotsFromKmh(d.wind_speed_10m_max[todayIdx])} kt`],
      ]
    },
    {
      title: 'Precipitations',
      items: [
        ['Actuelle',    `${c.precipitation?.toFixed(1)} mm/h`],
        ['Probabilite', `${h.precipitation_probability[hIdx] ?? 'N/A'}%`],
        ['Total jour',  `${d.precipitation_sum[todayIdx]?.toFixed(1)} mm`],
        ['Neige',       `${c.snowfall?.toFixed(1)} cm/h`],
      ]
    },
    // Ligne 2
    {
      title: 'Atmosphere',
      items: [
        ['Pression',   `${c.pressure_msl?.toFixed(1)} hPa`],
        ['UV actuel',  `${c.uv_index?.toFixed(1)}  ${getUvLabel(c.uv_index)}`],
        ['UV max',     `${d.uv_index_max[todayIdx]}`],
      ]
    },
    {
      title: 'Couverture nuageuse',
      items: [
        ['Total',      `${c.cloud_cover}%`],
        ['Bas / Moy',  `${h.cloud_cover_low[hIdx]}% / ${h.cloud_cover_mid[hIdx]}%`],
        ['Haut',       `${h.cloud_cover_high[hIdx]}%`],
      ]
    },
    {
      title: 'Visibilite & UV',
      items: [
        ['Distance',   `${(c.visibility / 1000).toFixed(1)} km`],
        ['Qualite',    getVisibilityLabel(c.visibility)],
        ['UV max j.',  `${d.uv_index_max[todayIdx]}`],
      ]
    },
  ];

  for (let i = 0; i < 6; i++) {
    const col = i % 3;
    const ligne = Math.floor(i / 3);
    const cx = PAD + col * (CW + GUTTER);
    const cy = Y + ligne * (CH + GUTTER);

    fillCard(ctx, cx, cy, CW, CH);

    // Titre carte
    txt(ctx, cells[i].title, cx + 14, cy + 24, { size: 14, weight: 'bold', color: C.bright });

    // Séparateur titre
    ctx.save();
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + 14, cy + 32);
    ctx.lineTo(cx + CW - 14, cy + 32);
    ctx.stroke();
    ctx.restore();

    // Données
    cells[i].items.forEach((item, j) => {
      row(ctx, item[0], item[1], cx + 14, cy + 54 + j * 26);
    });
  }

  Y += DATA_H;
  hline(ctx, Y);
  Y += SEP;

  // ── BANDE ASTRONOMIE ────────────────────────────────────────────────────────
  fillCard(ctx, PAD, Y, W - PAD * 2, ASTRO_H - GUTTER, C.card, C.border, 10);

  const astroItems = [
    ['Lever soleil', astro.sunrise],
    ['Coucher', astro.sunset],
    ['Zenith', astro.solar_noon],
    ['Duree du jour', astro.day_length],
    ['Lune', `${astro.moon.phaseEmoji} ${astro.moon.phaseName}  ${astro.moon.illumination}%`],
  ];
  const aColW = (W - PAD * 4) / astroItems.length;
  astroItems.forEach((item, i) => {
    const ax = PAD * 2 + i * aColW;
    txt(ctx, item[0], ax, Y + 22, { size: 12, color: C.dim });
    txt(ctx, item[1], ax, Y + 44, { size: 15, weight: 'bold', color: C.bright, max: aColW - 8 });
  });

  Y += ASTRO_H;

  // ── BANDE MARINE ────────────────────────────────────────────────────────────
  if (marine && MARINE_H) {
    const mh = marine.hourly;
    const { start: ms } = getNextHoursWindow(mh.time);
    const wH = mh.wave_height?.[ms];
    const wP = mh.wave_period?.[ms];
    const wD = mh.wave_direction?.[ms];
    const sH = mh.swell_wave_height?.[ms];

    if (wH != null) {
      fillCard(ctx, PAD, Y, W - PAD * 2, MARINE_H - GUTTER, C.marine, C.marineB, 10);
      const marineStr = [
        `Vagues : ${wH?.toFixed(2)} m`,
        `Periode : ${wP?.toFixed(1)} s`,
        `Direction : ${getWindDirection(wD)} (${wD?.toFixed(0)}deg)`,
        sH != null ? `Houle : ${sH?.toFixed(2)} m` : '',
      ].filter(Boolean).join('   |   ');
      txt(ctx, marineStr, PAD * 2, Y + 28, { size: 15, weight: 'bold', color: C.marineT });
    }
    Y += MARINE_H;
  }

  hline(ctx, Y);
  Y += SEP;

  // ── GRILLE DE GRAPHIQUES (2 colonnes) ───────────────────────────────────────
  const CW2 = (W - PAD * 2 - GUTTER) / 2;
  const chartOrder = ['temperature','wind','rain','pressure','clouds','uv','solar','tide'];
  const validCharts = chartOrder.filter(k => Buffer.isBuffer(charts[k]));

  for (let i = 0; i < validCharts.length; i++) {
    const col = i % 2;
    const ligne = Math.floor(i / 2);
    const cx = PAD + col * (CW2 + GUTTER);
    const cy = Y + ligne * (CHART_H + GUTTER);

    const img = await loadImage(charts[validCharts[i]]);
    ctx.drawImage(img, cx, cy, CW2, CHART_H);
  }

  Y += Math.ceil(validCharts.length / 2) * (CHART_H + GUTTER);

  // ── FOOTER ──────────────────────────────────────────────────────────────────
  hline(ctx, Y, 0.4);
  Y += 10;
  txt(
    ctx,
    `Open-Meteo  |  Sunrise-Sunset.org  |  QuickChart.io  |  Marees harmoniques (estimation)  —  ${now.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris' })}`,
    W / 2, Y + 26,
    { size: 12, color: C.dim, align: 'center' }
  );

  return canvas.encode('png');
}

module.exports = { generateCompositeImage };
