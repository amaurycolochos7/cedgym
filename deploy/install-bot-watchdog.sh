#!/bin/bash
# Instalador idempotente del watchdog del bot de WhatsApp.
# Corre en el servidor de prod. Re-corre cuando el script o los
# unit files cambien — sobreescribe sin perder estado.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/etc/dokploy/compose/compose-index-wireless-monitor-gscocg/code}"
SCRIPT_SRC="$REPO_DIR/deploy/bot-watchdog.sh"
SERVICE_SRC="$REPO_DIR/deploy/cedgym-bot-watchdog.service"
TIMER_SRC="$REPO_DIR/deploy/cedgym-bot-watchdog.timer"

SCRIPT_DST=/usr/local/bin/cedgym-bot-watchdog.sh
SERVICE_DST=/etc/systemd/system/cedgym-bot-watchdog.service
TIMER_DST=/etc/systemd/system/cedgym-bot-watchdog.timer

echo "→ Instalando script: $SCRIPT_DST"
install -m 0755 "$SCRIPT_SRC" "$SCRIPT_DST"

echo "→ Instalando unit files"
install -m 0644 "$SERVICE_SRC" "$SERVICE_DST"
install -m 0644 "$TIMER_SRC" "$TIMER_DST"

echo "→ systemctl daemon-reload"
systemctl daemon-reload

echo "→ Enable + start timer"
systemctl enable --now cedgym-bot-watchdog.timer

echo ""
echo "─── Estado del timer ───"
systemctl status cedgym-bot-watchdog.timer --no-pager | head -10

echo ""
echo "─── Próximas ejecuciones ───"
systemctl list-timers cedgym-bot-watchdog.timer --no-pager

echo ""
echo "✓ Watchdog instalado. Logs en /var/log/cedgym-bot-watchdog.log"
echo "  Probar manual:   sudo $SCRIPT_DST"
echo "  Ver logs:        tail -f /var/log/cedgym-bot-watchdog.log"
echo "  Ver runs:        journalctl -u cedgym-bot-watchdog.service -n 50"
