# ─── Discord Météo Bot — Makefile ────────────────────────────────────────────
# Usage : make <cible>
# Nécessite : docker, docker compose

.PHONY: help build up down restart logs status shell clean rebuild update

# Nom du service (doit correspondre à docker-compose.yml)
SERVICE = meteo-bot

# Couleurs
GREEN  = \033[0;32m
YELLOW = \033[0;33m
CYAN   = \033[0;36m
RESET  = \033[0m

help: ## 📖 Afficher cette aide
	@echo ""
	@echo "$(CYAN)Discord Météo Bot — Commandes disponibles$(RESET)"
	@echo "════════════════════════════════════════════"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-15s$(RESET) %s\n", $$1, $$2}'
	@echo ""

# ── Build ──────────────────────────────────────────────────────────────────────
build: ## 🔨 Builder l'image Docker
	@echo "$(YELLOW)→ Build de l'image...$(RESET)"
	docker compose build

rebuild: ## 🔨 Rebuild complet sans cache
	@echo "$(YELLOW)→ Rebuild sans cache...$(RESET)"
	docker compose build --no-cache

# ── Cycle de vie ──────────────────────────────────────────────────────────────
up: ## 🚀 Démarrer le bot (build si nécessaire)
	@echo "$(GREEN)→ Démarrage du bot...$(RESET)"
	docker compose up -d --build
	@echo "$(GREEN)✅ Bot démarré. Logs : make logs$(RESET)"

down: ## 🛑 Arrêter et supprimer le conteneur
	@echo "$(YELLOW)→ Arrêt du bot...$(RESET)"
	docker compose down

restart: ## 🔄 Redémarrer le bot
	@echo "$(YELLOW)→ Redémarrage...$(RESET)"
	docker compose restart $(SERVICE)

stop: ## ⏸️  Stopper sans supprimer le conteneur
	docker compose stop $(SERVICE)

start: ## ▶️  Démarrer un conteneur déjà créé
	docker compose start $(SERVICE)

# ── Monitoring ────────────────────────────────────────────────────────────────
logs: ## 📋 Suivre les logs en temps réel (Ctrl+C pour quitter)
	docker compose logs -f --tail=50 $(SERVICE)

status: ## 📊 Statut du conteneur (santé, ressources)
	@echo "$(CYAN)── Statut ──────────────────────────────────────────$(RESET)"
	@docker compose ps
	@echo ""
	@echo "$(CYAN)── Santé ───────────────────────────────────────────$(RESET)"
	@docker inspect --format='Health: {{.State.Health.Status}}  |  Uptime: {{.State.StartedAt}}' discord-meteo-bot 2>/dev/null || echo "Conteneur non démarré"
	@echo ""
	@echo "$(CYAN)── Ressources ──────────────────────────────────────$(RESET)"
	@docker stats discord-meteo-bot --no-stream --format "CPU: {{.CPUPerc}}  |  RAM: {{.MemUsage}}" 2>/dev/null || true

health: ## 🩺 Lancer le healthcheck manuellement
	docker exec discord-meteo-bot node healthcheck.js

# ── Shell ──────────────────────────────────────────────────────────────────────
shell: ## 🐚 Ouvrir un shell dans le conteneur (debug)
	docker exec -it discord-meteo-bot /bin/bash

# ── Dev ───────────────────────────────────────────────────────────────────────
dev: ## 🛠️  Démarrer en mode développement (hot-reload + debug)
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

dev-down: ## 🛑 Arrêter le mode développement
	docker compose -f docker-compose.yml -f docker-compose.dev.yml down

# ── Nettoyage ─────────────────────────────────────────────────────────────────
clean: ## 🧹 Supprimer conteneur + volumes + image locale
	@echo "$(YELLOW)→ Nettoyage...$(RESET)"
	docker compose down -v --rmi local
	@echo "$(GREEN)✅ Nettoyage terminé$(RESET)"

prune: ## 🧹 Nettoyer les images et couches Docker inutilisées (global)
	docker image prune -f
	docker builder prune -f

# ── Déploiement ───────────────────────────────────────────────────────────────
update: ## ⬆️  Mettre à jour le bot (pull git + rebuild + restart)
	@echo "$(CYAN)→ Mise à jour...$(RESET)"
	git pull
	docker compose build --no-cache
	docker compose up -d
	@echo "$(GREEN)✅ Mise à jour terminée$(RESET)"
	@make logs
