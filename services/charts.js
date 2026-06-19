'use strict';

const axios = require('axios');
const { getSolarElevationForDay, getTideForDay } = require('./astronomy');

const QC_URL   = 'https://quickchart.io/chart';
const BG       = 'rgb(20,20,32)';
const GRID     = 'rgba(255,255,255,0.07)';
const TICK     = '#BBBBCC';
const TITLE    = '#FFFFFF';
const LEG      = '#CCCCDD';

// ─── Heure courante Paris → préfixe "YYYY-MM-DDTHH" ─────────────────────────
function nowParisPrefix() {
  return new Date()
    .toLocaleString('sv', { timeZone: 'Europe/Paris' })
    .substring(0, 13)
    .replace(' ', 'T');
}

// ─── Fenêtre de N heures à partir de maintenant ──────────────────────────────
function getWindow(hourlyTimes, count = 25) {
  const prefix = nowParisPrefix();
  let start = 0;
  for (let i = 0; i < hourlyTimes.length; i++) {
    if (hourlyTimes[i].startsWith(prefix)) { start = i; break; }
    if (hourlyTimes[i] < prefix) start = i;
  }
  return { start, end: Math.min(start + count, hourlyTimes.length), startIdx: start };
}

// ─── Heure depuis "YYYY-MM-DDTHH:MM" ────────────────────────────────────────
const hl = t => t.substring(11, 16);

// ─── POST QuickChart (config JS string = supporte les callbacks) ──────────────
async function postChart(chartJsStr) {
  const res = await axios.post(QC_URL, {
    chart: chartJsStr,
    width: 760, height: 295,
    backgroundColor: BG,
    format: 'png', version: '3',
  }, { responseType: 'arraybuffer', timeout: 20000 });
  return Buffer.from(res.data);
}

// ─── Options communes ─────────────────────────────────────────────────────────
function opts({ title, yUnit = '', y1 = null, yMin = null, yMax = null }) {
  const yMinStr = yMin !== null ? `,min:${yMin}` : '';
  const yMaxStr = yMax !== null ? `,max:${yMax}` : '';
  const y1block = y1
    ? `,y1:{position:'right',min:0,max:100,grid:{drawOnChartArea:false},ticks:{color:'${y1.color}',callback:function(v){return v+'${y1.unit}';}}}`
    : '';
  return `{
    plugins:{
      title:{display:true,text:'${title}',color:'${TITLE}',font:{size:14,weight:'bold'}},
      legend:{labels:{color:'${LEG}',font:{size:11}}}
    },
    scales:{
      x:{ticks:{color:'${TICK}',maxRotation:45,font:{size:10}},grid:{color:'${GRID}'}},
      y:{ticks:{color:'${TICK}',callback:function(v){return v+'${yUnit}';}},grid:{color:'${GRID}'},position:'left'${yMinStr}${yMaxStr}}
      ${y1block}
    }
  }`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. TEMPÉRATURES
// ═══════════════════════════════════════════════════════════════════════════════
async function generateTemperatureChart(hourly) {
  const { start, end } = getWindow(hourly.time);
  const labels  = JSON.stringify(hourly.time.slice(start, end).map(hl));
  const temps   = JSON.stringify(hourly.temperature_2m.slice(start, end).map(v => v?.toFixed(1) ?? null));
  const feels   = JSON.stringify(hourly.apparent_temperature.slice(start, end).map(v => v?.toFixed(1) ?? null));
  return postChart(`{type:'line',data:{labels:${labels},datasets:[
    {label:'Température',data:${temps},borderColor:'rgb(255,107,53)',backgroundColor:'rgba(255,107,53,0.18)',fill:true,tension:0.4,pointRadius:3,borderWidth:2.5},
    {label:'Ressenti',data:${feels},borderColor:'rgb(255,200,70)',backgroundColor:'rgba(255,200,70,0.05)',fill:false,tension:0.4,pointRadius:2,borderWidth:2,borderDash:[5,4]}
  ]},options:${opts({ title: '🌡️ Températures sur 24h', yUnit: '°C' })}}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. VENT (noeuds + km/h en tooltip)
// ═══════════════════════════════════════════════════════════════════════════════
async function generateWindChart(hourly) {
  const { start, end } = getWindow(hourly.time);
  const labels = JSON.stringify(hourly.time.slice(start, end).map(hl));

  // Convertir en noeuds pour l'axe Y, garder km/h en label dataset
  const windKt  = JSON.stringify(hourly.wind_speed_10m.slice(start, end).map(v => v != null ? +(v / 1.852).toFixed(1) : null));
  const gustsKt = JSON.stringify(hourly.wind_gusts_10m.slice(start, end).map(v => v != null ? +(v / 1.852).toFixed(1) : null));

  return postChart(`{type:'line',data:{labels:${labels},datasets:[
    {label:'Vent moy. (kt)',data:${windKt},borderColor:'rgb(0,191,255)',backgroundColor:'rgba(0,191,255,0.18)',fill:true,tension:0.4,pointRadius:3,borderWidth:2.5},
    {label:'Rafales (kt)',data:${gustsKt},borderColor:'rgb(120,140,255)',backgroundColor:'rgba(120,140,255,0.08)',fill:false,tension:0.4,pointRadius:2,borderWidth:2,borderDash:[6,3]}
  ]},options:${opts({ title: '💨 Vent sur 24h', yUnit: ' kt' })}}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. PRÉCIPITATIONS
// ═══════════════════════════════════════════════════════════════════════════════
async function generatePrecipitationChart(hourly) {
  const { start, end } = getWindow(hourly.time);
  const labels = JSON.stringify(hourly.time.slice(start, end).map(hl));
  const precip = JSON.stringify(hourly.precipitation.slice(start, end).map(v => v?.toFixed(2) ?? 0));
  const prob   = JSON.stringify(hourly.precipitation_probability.slice(start, end));
  return postChart(`{type:'bar',data:{labels:${labels},datasets:[
    {label:'Précip. (mm)',data:${precip},backgroundColor:'rgba(30,144,255,0.75)',borderColor:'rgb(30,144,255)',borderWidth:1,yAxisID:'y'},
    {label:'Probabilité (%)',data:${prob},type:'line',borderColor:'rgb(0,210,210)',backgroundColor:'rgba(0,210,210,0.1)',fill:false,tension:0.4,borderWidth:2,pointRadius:2,yAxisID:'y1'}
  ]},options:${opts({ title: '🌧️ Précipitations sur 24h', yUnit: ' mm', yMin: 0, y1: { color: '#00D2D2', unit: '%' } })}}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. PRESSION
// ═══════════════════════════════════════════════════════════════════════════════
async function generatePressureChart(hourly) {
  const { start, end } = getWindow(hourly.time);
  const labels   = JSON.stringify(hourly.time.slice(start, end).map(hl));
  const pressure = JSON.stringify(hourly.pressure_msl.slice(start, end).map(v => v?.toFixed(1) ?? null));
  return postChart(`{type:'line',data:{labels:${labels},datasets:[
    {label:'Pression (hPa)',data:${pressure},borderColor:'rgb(147,112,219)',backgroundColor:'rgba(147,112,219,0.22)',fill:true,tension:0.4,pointRadius:3,borderWidth:2.5}
  ]},options:${opts({ title: '🔵 Pression atmosphérique sur 24h', yUnit: ' hPa' })}}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. NUAGES
// ═══════════════════════════════════════════════════════════════════════════════
async function generateCloudChart(hourly) {
  const { start, end } = getWindow(hourly.time);
  const labels = JSON.stringify(hourly.time.slice(start, end).map(hl));
  const total  = JSON.stringify(hourly.cloud_cover.slice(start, end));
  const low    = JSON.stringify(hourly.cloud_cover_low.slice(start, end));
  const mid    = JSON.stringify(hourly.cloud_cover_mid.slice(start, end));
  const high   = JSON.stringify(hourly.cloud_cover_high.slice(start, end));
  return postChart(`{type:'line',data:{labels:${labels},datasets:[
    {label:'Total',data:${total},borderColor:'rgb(160,160,160)',backgroundColor:'rgba(160,160,160,0.2)',fill:true,tension:0.4,pointRadius:2,borderWidth:2.5},
    {label:'Bas',data:${low},borderColor:'rgb(176,196,222)',fill:false,tension:0.4,pointRadius:2,borderWidth:1.5,borderDash:[4,3]},
    {label:'Moyen',data:${mid},borderColor:'rgb(100,180,220)',fill:false,tension:0.4,pointRadius:2,borderWidth:1.5,borderDash:[6,3]},
    {label:'Haut',data:${high},borderColor:'rgb(200,230,255)',fill:false,tension:0.4,pointRadius:2,borderWidth:1.5,borderDash:[8,4]}
  ]},options:${opts({ title: '☁️ Couverture nuageuse sur 24h', yUnit: '%', yMin: 0, yMax: 100 })}}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. UV INDEX
// ═══════════════════════════════════════════════════════════════════════════════
async function generateUvChart(hourly) {
  const { start, end } = getWindow(hourly.time);
  const labels = JSON.stringify(hourly.time.slice(start, end).map(hl));
  const uv     = JSON.stringify(hourly.uv_index.slice(start, end).map(v => v?.toFixed(1) ?? 0));

  // Zones de danger (annotations via dataset fill + background colors par zone)
  return postChart(`{type:'bar',data:{labels:${labels},datasets:[
    {label:'UV Index',data:${uv},backgroundColor:function(ctx){
      const v=ctx.dataset.data[ctx.dataIndex];
      if(v>=11)return 'rgba(148,0,211,0.85)';
      if(v>=8)return 'rgba(255,0,0,0.80)';
      if(v>=6)return 'rgba(255,140,0,0.82)';
      if(v>=3)return 'rgba(255,215,0,0.82)';
      return 'rgba(76,175,80,0.82)';
    },borderColor:'rgba(0,0,0,0)',borderWidth:0,borderRadius:3}
  ]},options:${opts({ title: '☀️ UV Index sur 24h', yUnit: '', yMin: 0 })}}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. ÉLÉVATION SOLAIRE
// ═══════════════════════════════════════════════════════════════════════════════
async function generateSolarElevationChart(hourlyTimes) {
  const lat = parseFloat(process.env.LAT);
  const lon = parseFloat(process.env.LON);
  const { start, end, startIdx } = getWindow(hourlyTimes);
  const labels = JSON.stringify(hourlyTimes.slice(start, end).map(hl));

  // Reconstruire les dates UTC depuis les heures Paris
  // Open-Meteo renvoie l'heure locale Paris sans offset → on applique l'offset manuellement
  const parisOffsetH = getParisOffsetHours();
  const startTimeUTC = new Date(
    new Date(hourlyTimes[start] + ':00').getTime() - parisOffsetH * 3_600_000
  );

  const elevations = JSON.stringify(getSolarElevationForDay(lat, lon, startTimeUTC, end - start));

  return postChart(`{type:'line',data:{labels:${labels},datasets:[
    {label:'Élévation (°)',data:${elevations},borderColor:'rgb(255,220,50)',backgroundColor:function(ctx){
      const v=ctx.dataset.data[ctx.dataIndex];
      if(v<=0)return 'rgba(0,0,50,0.4)';
      if(v<15)return 'rgba(255,120,30,0.3)';
      return 'rgba(255,220,50,0.25)';
    },fill:true,tension:0.4,pointRadius:2,borderWidth:2.5}
  ]},options:${opts({ title: '⬆️ Elevation solaire sur 24h', yUnit: '°', yMin: -10 })}}`);
}

// Offset UTC de Paris en heures (gère l'heure d'été)
function getParisOffsetHours() {
  const now = new Date();
  const paris = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  return (paris - new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }))) / 3_600_000;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. MARÉES (calcul harmonique approximatif)
// ═══════════════════════════════════════════════════════════════════════════════
async function generateTideChart(hourlyTimes) {
  const { start, end } = getWindow(hourlyTimes);
  const labels = JSON.stringify(hourlyTimes.slice(start, end).map(hl));

  // Heure de départ (heure locale Paris → UTC)
  const parisOffsetH = getParisOffsetHours();
  const startTimeUTC = new Date(
    new Date(hourlyTimes[start] + ':00').getTime() - parisOffsetH * 3_600_000
  );

  const tides = JSON.stringify(getTideForDay(startTimeUTC, end - start));

  return postChart(`{type:'line',data:{labels:${labels},datasets:[
    {label:'Hauteur marée (m)',data:${tides},borderColor:'rgb(0,180,216)',backgroundColor:'rgba(0,180,216,0.20)',fill:true,tension:0.4,pointRadius:3,borderWidth:2.5}
  ]},options:${opts({ title: '🌊 Marees sur 24h (estimation harmonique)', yUnit: ' m' })}}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// GÉNÉRATION PARALLÈLE DES 8 GRAPHIQUES
// ═══════════════════════════════════════════════════════════════════════════════
async function generateAllCharts(hourly) {
  const keys = ['temperature','wind','rain','pressure','clouds','uv','solar','tide'];
  const jobs = [
    generateTemperatureChart(hourly),
    generateWindChart(hourly),
    generatePrecipitationChart(hourly),
    generatePressureChart(hourly),
    generateCloudChart(hourly),
    generateUvChart(hourly),
    generateSolarElevationChart(hourly.time),
    generateTideChart(hourly.time),
  ];

  const results = await Promise.allSettled(jobs);
  const out = { errors: [] };
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') out[keys[i]] = r.value;
    else {
      out[keys[i]] = null;
      out.errors.push(`${keys[i]}: ${r.reason?.message}`);
    }
  });
  return out;
}

module.exports = {
  generateAllCharts,
  generateTemperatureChart,
  generateWindChart,
  generatePrecipitationChart,
  generatePressureChart,
  generateCloudChart,
  generateUvChart,
  generateSolarElevationChart,
  generateTideChart,
};
