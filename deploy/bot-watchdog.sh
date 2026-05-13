#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# CED-GYM WhatsApp Bot watchdog — auto-recovery en 3 niveles.
#
# Lo dispara un systemd timer cada 2 min. Si el bot está sano sale en
# silencio (sin spam de logs). Si detecta caída intenta:
#
#   Nivel 1: docker restart $BOT (lo que el restart policy ya debería
#            hacer pero a veces se rinde tras varios crashes).
#   Nivel 2: rm -f del container + matar docker-proxy huérfanos en
#            puerto 3002 + docker compose up -d whatsapp-bot.
#   Nivel 3: trigger del webhook de Dokploy → rebuild + redeploy.
#
# Después de cada acción espera a confirmar que el bot quedó Up. Si
# nada funciona, escribe un FATAL al log y sale 1 — el timer reintenta
# en 2 min de todos modos.
#
# Diseño defensivo:
#   - set -u pero NO set -e: queremos seguir probando niveles aunque
#     uno tire error.
#   - Logs append-only a /var/log/cedgym-bot-watchdog.log con rotación
#     básica si pasa 10 MB (truncamos a los últimos 5000 líneas).
#   - No depende de paquetes raros: docker, curl, ss, awk, sed.
# ═══════════════════════════════════════════════════════════════════

set -u

BOT_NAME=compose-index-wireless-monitor-gscocg-whatsapp-bot-1
COMPOSE_DIR=/etc/dokploy/compose/compose-index-wireless-monitor-gscocg/code
WEBHOOK_URL=${BOT_WATCHDOG_WEBHOOK_URL:-http://187.77.11.79:3000/api/deploy/compose/cD-O6D_VEIYEuYdZmw8vZ}
LOG=${BOT_WATCHDOG_LOG:-/var/log/cedgym-bot-watchdog.log}
BOT_PORT=3002

mkdir -p "$(dirname "$LOG")"

# Rotación naive: si el log pasa 10 MB nos quedamos con los últimos
# 5000 líneas. Suficiente para varios días de actividad normal.
if [ -f "$LOG" ] && [ "$(stat -c %s "$LOG" 2>/dev/null || echo 0)" -gt 10485760 ]; then
  tail -n 5000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi

log() {
  echo "[$(date -Iseconds)] $*" | tee -a "$LOG" >&2
}

bot_status() {
  docker inspect --format='{{.State.Status}}' "$BOT_NAME" 2>/dev/null || echo "missing"
}

bot_health() {
  docker inspect \
    --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \
    "$BOT_NAME" 2>/dev/null || echo "missing"
}

bot_http_ok() {
  # Probamos /health desde otro container del stack (api) que tiene
  # network access al hostname `whatsapp-bot`. Si responde 200 es que
  # de verdad el bot está vivo, no solo "running" en docker.
  docker exec compose-index-wireless-monitor-gscocg-api-1 \
    sh -c 'wget -q -O /dev/null --timeout=5 http://whatsapp-bot:3002/health 2>/dev/null' \
    2>/dev/null
}

wait_for_up() {
  # Espera hasta $1 segundos a que el container quede "running".
  local deadline=$(( $(date +%s) + ${1:-60} ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if [ "$(bot_status)" = "running" ]; then
      sleep 5  # extra para que health checks estabilicen
      return 0
    fi
    sleep 3
  done
  return 1
}

free_port_3002() {
  # Mata docker-proxy huérfanos en el puerto del bot. Es la causa más
  # común del error "Address already in use" cuando docker compose
  # intenta recrear el container.
  local pids
  pids=$(ss -tlnp 2>/dev/null | grep ":${BOT_PORT} " \
    | grep -oE 'pid=[0-9]+' | sed 's/pid=//' | sort -u)
  if [ -n "$pids" ]; then
    for p in $pids; do
      log "  matando docker-proxy huérfano PID $p en puerto $BOT_PORT"
      kill -9 "$p" 2>/dev/null || true
    done
    sleep 2
  fi
}

# ─── Chequeo ────────────────────────────────────────────────────────
STATUS=$(bot_status)
HEALTH=$(bot_health)

# Camino feliz: silencio total si el bot está bien.
if [ "$STATUS" = "running" ] && { [ "$HEALTH" = "healthy" ] || [ "$HEALTH" = "none" ]; }; then
  if bot_http_ok; then
    exit 0
  fi
  log "Bot reporta running/healthy pero /health HTTP no responde — escalo a recovery."
fi

log "Bot DEGRADADO: status=$STATUS health=$HEALTH — iniciando recovery"

# ─── Nivel 1: docker restart ────────────────────────────────────────
if [ "$STATUS" != "missing" ]; then
  log "Nivel 1: docker restart $BOT_NAME"
  if docker restart "$BOT_NAME" >/dev/null 2>&1; then
    if wait_for_up 60 && bot_http_ok; then
      log "✓ Nivel 1 funcionó — bot recuperado por restart simple."
      exit 0
    fi
  fi
  log "  Nivel 1 falló — sigo a nivel 2"
fi

# ─── Nivel 2: rm + recreate ─────────────────────────────────────────
log "Nivel 2: rm -f + free port + docker compose up -d"
docker rm -f "$BOT_NAME" >/dev/null 2>&1 || true
free_port_3002

# Intentamos primero el comando local (rápido). Si falta env, fallará
# y caemos al webhook de Dokploy (que sí tiene las env vars).
if [ -d "$COMPOSE_DIR" ]; then
  pushd "$COMPOSE_DIR" >/dev/null
  if docker compose up -d --no-deps whatsapp-bot 2>>"$LOG"; then
    popd >/dev/null
    if wait_for_up 90 && bot_http_ok; then
      log "✓ Nivel 2 funcionó — bot recreado por docker compose."
      exit 0
    fi
  else
    popd >/dev/null
    log "  docker compose up falló (probable env vars faltantes)"
  fi
fi
log "  Nivel 2 falló — sigo a nivel 3"

# ─── Nivel 3: Dokploy webhook ───────────────────────────────────────
log "Nivel 3: trigger del webhook de Dokploy"
RESP=$(curl -sS -X POST "$WEBHOOK_URL" \
  -H 'Content-Type: application/json' \
  -H 'X-GitHub-Event: push' \
  -d '{"ref":"refs/heads/main"}' \
  --max-time 30 -L 2>&1) || true
log "  Webhook respondió: $RESP"

if wait_for_up 240 && bot_http_ok; then
  log "✓ Nivel 3 funcionó — bot recuperado vía Dokploy redeploy."
  exit 0
fi

log "✗ FATAL — ningún nivel recuperó el bot. status=$(bot_status) health=$(bot_health). El timer reintentará en 2 min."
exit 1
