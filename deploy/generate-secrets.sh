#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# CED-GYM — Generador de secrets para el deploy.
#
# Uso:
#   bash deploy/generate-secrets.sh
#   bash deploy/generate-secrets.sh > deploy/.secrets.local   # guarda a archivo (NO commitees)
#
# Copia/pega los valores en Dokploy → <servicio> → Environment.
# ═══════════════════════════════════════════════════════════════

set -e

if ! command -v openssl >/dev/null 2>&1; then
  echo "ERROR: openssl no está instalado. Instalalo o usá Git Bash / WSL." >&2
  exit 1
fi

echo "# ─── CED-GYM secrets ($(date -u +%Y-%m-%dT%H:%M:%SZ)) ───"
echo "# Guardalos en un lugar seguro. Si se pierden hay que regenerarlos TODOS."
echo ""
echo "JWT_SECRET=$(openssl rand -hex 32)"
echo "JWT_REFRESH_SECRET=$(openssl rand -hex 32)"
echo "MP_WEBHOOK_SECRET=$(openssl rand -hex 24)"
echo "WHATSAPP_BOT_KEY=$(openssl rand -hex 24)"
echo "POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d /=+)"
echo "MINIO_PASSWORD=$(openssl rand -base64 24 | tr -d /=+)"
echo ""
echo "# ─── Completar manualmente desde Mercado Pago ───"
echo "# MP_ACCESS_TOKEN=APP_USR-..."
echo "# MP_PUBLIC_KEY=APP_USR-..."
