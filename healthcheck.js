'use strict';
/**
 * Script de healthcheck Docker.
 * Le bot principal écrit /tmp/.bot-alive toutes les 30s.
 * Ce script lit le timestamp et exit 0 (sain) ou 1 (malade).
 *
 * Appelé par : HEALTHCHECK CMD node healthcheck.js
 */

const { readFileSync } = require('fs');

const HEARTBEAT_FILE  = '/tmp/.bot-alive';
const MAX_AGE_MS      = 2 * 60 * 1000; // 2 minutes = 4 cycles de 30s manqués

try {
  const raw = readFileSync(HEARTBEAT_FILE, 'utf8').trim();
  const ts  = parseInt(raw, 10);

  if (isNaN(ts)) {
    console.error('[healthcheck] ❌ Fichier heartbeat corrompu');
    process.exit(1);
  }

  const ageMs  = Date.now() - ts;
  const ageSec = Math.round(ageMs / 1000);

  if (ageMs > MAX_AGE_MS) {
    console.error(`[healthcheck] ❌ Bot inactif depuis ${ageSec}s (seuil : ${MAX_AGE_MS / 1000}s)`);
    process.exit(1);
  }

  console.log(`[healthcheck] ✅ Bot actif — dernier heartbeat il y a ${ageSec}s`);
  process.exit(0);

} catch (err) {
  if (err.code === 'ENOENT') {
    console.error('[healthcheck] ❌ Fichier heartbeat absent (bot pas encore prêt ou crashé)');
  } else {
    console.error('[healthcheck] ❌ Erreur lecture heartbeat :', err.message);
  }
  process.exit(1);
}
