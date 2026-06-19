# ═══════════════════════════════════════════════════════════════════════════════
# Stage 1 — Installation des dépendances npm
# ═══════════════════════════════════════════════════════════════════════════════
FROM node:20-slim AS deps

WORKDIR /app

# Libs nécessaires pour que @napi-rs/canvas télécharge/lie ses binaires
RUN apt-get update && apt-get install -y --no-install-recommends \
    libfontconfig1 \
    libfreetype6 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

# Installation de PROD seulement (pas devDeps)
RUN npm ci --omit=dev --no-audit --no-fund

# ═══════════════════════════════════════════════════════════════════════════════
# Stage 2 — Image finale (allégée)
# ═══════════════════════════════════════════════════════════════════════════════
FROM node:20-slim AS runtime

LABEL org.opencontainers.image.title="Discord Météo Bot"
LABEL org.opencontainers.image.description="Bot Discord météo ultra-détaillé — Open-Meteo, QuickChart, calcul astronomique"
LABEL org.opencontainers.image.source="https://github.com/ton-repo/discord-meteo-bot"

# ── Dépendances système runtime ────────────────────────────────────────────────
# libfontconfig1 + libfreetype6 : runtime @napi-rs/canvas
# fonts-dejavu-core             : polices fiables pour le rendu canvas
# fonts-noto                    : fallback unicode large (emoji inclus si disponible)
# ca-certificates               : requêtes HTTPS (Open-Meteo, Discord, QuickChart)
# tzdata                        : gestion correcte des fuseaux horaires
RUN apt-get update && apt-get install -y --no-install-recommends \
    fontconfig \
    libfontconfig1 \
    libfreetype6 \
    fonts-dejavu-core \
    ca-certificates \
    tzdata \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

# ── Variables d'environnement ──────────────────────────────────────────────────
ENV NODE_ENV=production \
    TZ=Europe/Paris \
    NODE_OPTIONS="--max-old-space-size=384"

WORKDIR /app

# ── Copie depuis le stage deps ─────────────────────────────────────────────────
COPY --from=deps /app/node_modules ./node_modules

# ── Code source ───────────────────────────────────────────────────────────────
COPY index.js       ./
COPY healthcheck.js ./
COPY commands/      ./commands/
COPY services/      ./services/

# ── Utilisateur non-root (sécurité) ───────────────────────────────────────────
RUN groupadd --gid 1001 botgroup \
    && useradd  --uid 1001 --gid botgroup --shell /bin/false --no-create-home botuser \
    && chown -R botuser:botgroup /app

USER botuser

# ── Healthcheck via fichier heartbeat écrit par le bot ────────────────────────
HEALTHCHECK \
    --interval=60s \
    --timeout=10s  \
    --start-period=45s \
    --retries=3    \
    CMD node healthcheck.js

CMD ["node", "index.js"]
