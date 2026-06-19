'use strict';

require('dotenv').config();

const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const cron = require('node-cron');
const path = require('path');
const fs   = require('fs');

// ─── Validation des variables d'environnement ─────────────────────────────────
const REQUIRED_ENV = ['DISCORD_TOKEN', 'CHANNEL_ID', 'LAT', 'LON'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`❌ Variable d'environnement manquante : ${key}`);
    process.exit(1);
  }
}

// ─── Client Discord ───────────────────────────────────────────────────────────
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

// ─── Chargement des commandes ─────────────────────────────────────────────────
const commandsDir = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'))) {
  const cmd = require(path.join(commandsDir, file));
  if (!cmd.data || !cmd.execute) {
    console.warn(`⚠️  Commande ignorée (structure invalide) : ${file}`);
    continue;
  }
  client.commands.set(cmd.data.name, cmd);
  console.log(`✅ Commande chargée : /${cmd.data.name}`);
}

// ─── Prêt ─────────────────────────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`\n🤖 Connecté en tant que ${client.user.tag}`);
  console.log(`📍 Localisation : ${process.env.LOCATION_NAME || `${process.env.LAT}°, ${process.env.LON}°`}`);
  console.log(`⏰ Message quotidien : ${process.env.SEND_HOUR}h${String(process.env.SEND_MINUTE || 0).padStart(2,'0')}\n`);

  // ── Enregistrement global des commandes slash ──────────────────────────────
  const rest    = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const payload = [...client.commands.values()].map(c => c.data.toJSON());

  try {
    console.log('📡 Enregistrement des commandes slash (global)…');
    await rest.put(Routes.applicationCommands(client.user.id), { body: payload });
    console.log(`✅ ${payload.length} commande(s) enregistrée(s)\n`);
  } catch (err) {
    console.error('❌ Erreur enregistrement commandes :', err.message);
  }

  // ── Cron : message météo quotidien ────────────────────────────────────────
  const hour   = parseInt(process.env.SEND_HOUR,   10) || 7;
  const minute = parseInt(process.env.SEND_MINUTE, 10) || 30;
  const cronExpr = `${minute} ${hour} * * *`;

  cron.schedule(cronExpr, async () => {
    console.log(`\n⏰ [${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}] Envoi du rapport météo quotidien…`);

    // Invalider le cache pour forcer un rafraîchissement
    require('./services/weather').invalidateCache();
    require('./services/astronomy').invalidateAstroCache();

    try {
      const channel = await client.channels.fetch(process.env.CHANNEL_ID);
      if (!channel?.isTextBased()) {
        console.error('❌ Channel introuvable ou non textuel :', process.env.CHANNEL_ID);
        return;
      }
      const { sendWeatherReport } = require('./commands/meteo');
      await sendWeatherReport(channel, false);
      console.log('✅ Rapport météo quotidien envoyé.');
    } catch (err) {
      console.error('❌ Erreur envoi quotidien :', err.message);
    }
  }, { timezone: 'Europe/Paris' });

  console.log(`⏰ Cron programmé : "${cronExpr}" (Europe/Paris)`);
});

// ─── Gestion des interactions ─────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    console.warn(`⚠️  Commande inconnue reçue : ${interaction.commandName}`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`❌ Erreur commande /${interaction.commandName} :`, err);
    const errMsg = { content: `❌ Une erreur inattendue est survenue.`, ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errMsg).catch(() => {});
    } else {
      await interaction.reply(errMsg).catch(() => {});
    }
  }
});

// ─── Erreurs non gérées ───────────────────────────────────────────────────────
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️  UnhandledRejection :', reason);
});

process.on('uncaughtException', (err) => {
  console.error('💥 UncaughtException :', err);
});

// ─── Connexion ────────────────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error('❌ Connexion Discord échouée :', err.message);
  process.exit(1);
});
