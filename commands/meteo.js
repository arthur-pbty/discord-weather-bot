'use strict';

const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const {
  fetchWeatherData, getCurrentHourIndex, getNextHoursWindow, getTodayDailyIndex,
  celsiusToKelvin, getWindDirection, getWeatherDescription, getEmbedColor,
  getPressureTendency, getVisibilityLabel, getUvLabel, checkAlerts, knotsFromKmh,
} = require('../services/weather');
const { fetchAstronomyData } = require('../services/astronomy');
const { generateAllCharts } = require('../services/charts');
const { generateCompositeImage } = require('../services/composite');

// ─── Embed principal ──────────────────────────────────────────────────────────
function buildWeatherEmbed(weather, marine, astro, charts) {
  const c   = weather.current;
  const h   = weather.hourly;
  const d   = weather.daily;

  const todayIdx   = getTodayDailyIndex(d.time);
  const hourIdx    = getCurrentHourIndex(h.time);
  const location   = process.env.LOCATION_NAME || `${process.env.LAT}°N ${process.env.LON}°E`;
  const pressTrend = getPressureTendency(h.pressure_msl, hourIdx);
  const isDebug    = process.env.DEBUG_METEO === 'true';

  // Comparaison J-1
  const yIdx = todayIdx - 1;
  const hasY = yIdx >= 0 && d.time[yIdx];
  const sign = n => (+n > 0 ? `+${n}` : `${n}`);
  const dTmax = hasY ? (d.temperature_2m_max[todayIdx] - d.temperature_2m_max[yIdx]).toFixed(1) : null;
  const dRain = hasY ? (d.precipitation_sum[todayIdx] - d.precipitation_sum[yIdx]).toFixed(1) : null;
  const dWind = hasY ? (d.wind_speed_10m_max[todayIdx] - d.wind_speed_10m_max[yIdx]).toFixed(1) : null;

  const alerts = checkAlerts(c, d);
  const color  = getEmbedColor(c.weather_code);
  const upd    = new Date().toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit', second:'2-digit', timeZone:'Europe/Paris' });

  const embed = new EmbedBuilder()
    .setTitle(`${getWeatherDescription(c.weather_code)}  —  ${location}`)
    .setColor(color)
    .setDescription(
      `**${c.temperature_2m?.toFixed(1)}°C** · Ressenti **${c.apparent_temperature?.toFixed(1)}°C** · ${c.is_day ? '🌞 Jour' : '🌙 Nuit'}`
    )
    // ── Températures ──────────────────────────────────────────────────────────
    .addFields({
      name: '🌡️ Températures',
      value: [
        `Actuelle   : **${c.temperature_2m?.toFixed(1)}°C** (${celsiusToKelvin(c.temperature_2m)} K)`,
        `Ressentie  : **${c.apparent_temperature?.toFixed(1)}°C**`,
        `Max / Min  : **${d.temperature_2m_max[todayIdx]}°C** / **${d.temperature_2m_min[todayIdx]}°C**`,
        `Humidité   : **${c.relative_humidity_2m}%**`,
      ].join('\n'),
      inline: true,
    })
    // ── Vent (noeuds + km/h) ──────────────────────────────────────────────────
    .addFields({
      name: '💨 Vent',
      value: [
        `Vitesse    : **${knotsFromKmh(c.wind_speed_10m)} kt** (${c.wind_speed_10m?.toFixed(0)} km/h)`,
        `Rafales    : **${knotsFromKmh(c.wind_gusts_10m)} kt** (${c.wind_gusts_10m?.toFixed(0)} km/h)`,
        `Direction  : **${getWindDirection(c.wind_direction_10m)}** (${c.wind_direction_10m?.toFixed(0)}°)`,
        `Max jour   : **${knotsFromKmh(d.wind_speed_10m_max[todayIdx])} kt** (${d.wind_speed_10m_max[todayIdx]} km/h)`,
      ].join('\n'),
      inline: true,
    })
    // ── Précipitations ────────────────────────────────────────────────────────
    .addFields({
      name: '🌧️ Précipitations',
      value: [
        `Actuelle   : **${c.precipitation?.toFixed(1)} mm/h**`,
        `Probabilité: **${h.precipitation_probability[hourIdx] ?? 'N/A'}%**`,
        `Total jour : **${d.precipitation_sum[todayIdx]?.toFixed(1)} mm**`,
        `Neige      : ${c.snowfall?.toFixed(1)} cm/h`,
      ].join('\n'),
      inline: true,
    })
    // ── Atmosphère ────────────────────────────────────────────────────────────
    .addFields({
      name: '🔵 Atmosphère',
      value: [
        `Pression   : **${c.pressure_msl?.toFixed(1)} hPa** ${pressTrend}`,
        `UV actuel  : **${c.uv_index?.toFixed(1)}** — ${getUvLabel(c.uv_index)}`,
        `UV max j.  : **${d.uv_index_max[todayIdx]}**`,
      ].join('\n'),
      inline: true,
    })
    // ── Nuages ────────────────────────────────────────────────────────────────
    .addFields({
      name: '☁️ Nuages',
      value: [
        `Total   : **${c.cloud_cover}%**`,
        `Bas     : ${h.cloud_cover_low[hourIdx]}%`,
        `Moyen   : ${h.cloud_cover_mid[hourIdx]}%`,
        `Haut    : ${h.cloud_cover_high[hourIdx]}%`,
      ].join('\n'),
      inline: true,
    })
    // ── Visibilité ────────────────────────────────────────────────────────────
    .addFields({
      name: '👁️ Visibilité',
      value: [
        `**${(c.visibility / 1000).toFixed(1)} km**`,
        getVisibilityLabel(c.visibility),
      ].join('\n'),
      inline: true,
    })
    // ── Astronomie ────────────────────────────────────────────────────────────
    .addFields({
      name: '🌅 Astronomie',
      value: [
        `🌅 **${astro.sunrise}**  ·  🌇 **${astro.sunset}**  ·  ☀️ Zénith **${astro.solar_noon}**  ·  ⏱️ **${astro.day_length}**`,
      ].join('\n'),
      inline: false,
    })
    // ── Lune ──────────────────────────────────────────────────────────────────
    .addFields({
      name: '🌙 Phase lunaire',
      value: [
        `${astro.moon.phaseEmoji} **${astro.moon.phaseName}**`,
        `Illumination : **${astro.moon.illumination}%**  ·  J+${astro.moon.daysInCycle}`,
      ].join('\n'),
      inline: true,
    });

  // ── Marine ────────────────────────────────────────────────────────────────
  if (marine) {
    const mh = marine.hourly;
    const { start } = getNextHoursWindow(mh.time);
    const wH = mh.wave_height?.[start], wP = mh.wave_period?.[start];
    const wD = mh.wave_direction?.[start], sH = mh.swell_wave_height?.[start];
    if (wH != null) {
      embed.addFields({
        name: '🌊 Marine',
        value: [
          `Vagues  : **${wH?.toFixed(2)} m**  ·  Période : **${wP?.toFixed(1)} s**`,
          `Direction : **${getWindDirection(wD)}** (${wD?.toFixed(0)}°)${sH != null ? `  ·  Houle : **${sH?.toFixed(2)} m**` : ''}`,
        ].join('\n'),
        inline: true,
      });
    }
  }

  // ── Comparaison J-1 ───────────────────────────────────────────────────────
  if (hasY && dTmax !== null) {
    embed.addFields({
      name: '📊 Vs hier',
      value: `Tmax ${sign(dTmax)}°C ${+dTmax>0?'↑':'↓'}  ·  Pluie ${sign(dRain)} mm ${+dRain>0?'↑':'↓'}  ·  Vent max ${sign(dWind)} km/h ${+dWind>0?'↑':'↓'}`,
      inline: false,
    });
  }

  // ── Alertes ───────────────────────────────────────────────────────────────
  if (alerts.length > 0) {
    embed.addFields({
      name: '⚠️ Alertes',
      value: alerts.map(a => `${a.lvl} ${a.msg}`).join('\n'),
      inline: false,
    });
  }

  // ── Debug ─────────────────────────────────────────────────────────────────
  if (isDebug) {
    embed.addFields({
      name: '🔧 Debug',
      value: [
        `Cache     : ${weather.fetchedAt?.toLocaleTimeString('fr-FR', { timeZone:'Europe/Paris' })}`,
        `hourIdx   : ${hourIdx}  |  todayIdx : ${todayIdx}`,
        `Astro src : ${astro.source}`,
        `Charts OK : ${Object.keys(charts).filter(k => Buffer.isBuffer(charts[k])).length}/8`,
      ].join('\n'),
      inline: false,
    });
  }

  if (charts.errors?.length) {
    embed.addFields({ name: '⚙️ Graphiques partiels', value: `${charts.errors.length} erreur(s)`, inline: false });
  }

  embed.setFooter({ text: `📡 Open-Meteo · Sunrise-Sunset.org · QuickChart.io  |  🕐 ${upd}` });
  return embed;
}

// ─── Envoi du rapport complet ─────────────────────────────────────────────────
async function sendWeatherReport(target, isInteraction = false) {
  const { weather, marine, fetchedAt } = await fetchWeatherData();
  const astro  = await fetchAstronomyData(process.env.LAT, process.env.LON, weather.daily);
  const charts = await generateAllCharts(weather.hourly);

  const embed = buildWeatherEmbed({ ...weather, fetchedAt }, marine, astro, charts);

  const chartDefs = [
    { key:'temperature', name:'temperature.png' },
    { key:'wind',        name:'wind.png'        },
    { key:'rain',        name:'precipitation.png'},
    { key:'pressure',    name:'pressure.png'    },
    { key:'clouds',      name:'clouds.png'      },
    { key:'uv',          name:'uv.png'          },
    { key:'solar',       name:'solar.png'       },
    { key:'tide',        name:'tide.png'        },
  ];
  const files = chartDefs
    .filter(d => Buffer.isBuffer(charts[d.key]))
    .map(d => new AttachmentBuilder(charts[d.key], { name: d.name }));

  const send    = o => isInteraction ? target.editReply(o)  : target.send(o);
  const followUp = o => isInteraction ? target.followUp(o)  : target.send(o);

  await send({ embeds: [embed] });

  if (files.length > 0) {
    await followUp({ content: `📊 **Graphiques sur 24h** (${files.length}/8)`, files });
  }

  // ── Image composite récapitulative ────────────────────────────────────────
  try {
    const compositeBuffer = await generateCompositeImage({ weather: { weather, fetchedAt }, marine, astro, charts });
    await followUp({
      content: '🖼️ **Rapport récapitulatif — image partageable**',
      files: [new AttachmentBuilder(compositeBuffer, { name: 'meteo_recap.png' })],
    });
  } catch (err) {
    console.warn('[composite] Génération échouée :', err.message);
    // Pas d'erreur fatale si le composite rate
  }
}

// ─── Commande slash ───────────────────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName('meteo')
    .setDescription('Météo ultra-détaillée avec graphiques et image récapitulative'),

  async execute(interaction) {
    await interaction.deferReply();
    try {
      await sendWeatherReport(interaction, true);
    } catch (err) {
      console.error('[/meteo]', err);
      const msg = `❌ **Erreur**\n\`\`\`${err.message}\`\`\``;
      await (interaction.deferred ? interaction.editReply({ content: msg }) : interaction.reply({ content: msg, ephemeral: true }));
    }
  },

  sendWeatherReport,
};
