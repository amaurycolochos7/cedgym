#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# CED-GYM — Provisión automática de apps en Dokploy vía API.
#
# Prerequisitos:
#   1. Token de Dokploy:  Panel → Profile → Generate API Key (copialo).
#   2. projectId de `cedgym`: Panel → Projects → cedgym → ver URL
#      (ej. https://panel.../project/abc123  → DOKPLOY_PROJECT_ID=abc123)
#   3. Secrets ya en deploy/.secrets.local (correr generate-secrets.sh primero).
#   4. MP_ACCESS_TOKEN y MP_PUBLIC_KEY reales de Mercado Pago.
#
# Uso:
#   export DOKPLOY_URL=https://panel.187-77-11-79.sslip.io
#   export DOKPLOY_TOKEN=<tu token>
#   export DOKPLOY_PROJECT_ID=<id del proyecto cedgym>
#   export GITHUB_REPO=amaurycolochos7/cedgym
#   export MP_ACCESS_TOKEN=APP_USR-xxxx
#   export MP_PUBLIC_KEY=APP_USR-xxxx
#   bash deploy/dokploy-api-setup.sh
# ═══════════════════════════════════════════════════════════════

set -e

: "${DOKPLOY_URL:?falta DOKPLOY_URL (ej. https://panel.187-77-11-79.sslip.io)}"
: "${DOKPLOY_TOKEN:?falta DOKPLOY_TOKEN}"
: "${DOKPLOY_PROJECT_ID:?falta DOKPLOY_PROJECT_ID}"
: "${GITHUB_REPO:=amaurycolochos7/cedgym}"
: "${MP_ACCESS_TOKEN:?falta MP_ACCESS_TOKEN}"
: "${MP_PUBLIC_KEY:?falta MP_PUBLIC_KEY}"

# Cargar secrets
source deploy/.secrets.local 2>/dev/null || {
  echo "ERROR: falta deploy/.secrets.local — correr 'bash deploy/generate-secrets.sh > deploy/.secrets.local'"
  exit 1
}

API() { curl -s -H "Authorization: Bearer $DOKPLOY_TOKEN" -H "Content-Type: application/json" "$@"; }

echo "▶ Verificando token…"
API "$DOKPLOY_URL/api/auth/me" >/dev/null || { echo "ERROR: token inválido"; exit 1; }

echo "▶ Creando Postgres cedgym-db…"
API -X POST "$DOKPLOY_URL/api/postgres.create" -d "$(cat <<JSON
{
  "name":"cedgym-db",
  "appName":"cedgym-db",
  "databaseName":"cedgym",
  "databaseUser":"cedgym",
  "databasePassword":"$POSTGRES_PASSWORD",
  "dockerImage":"postgres:16-alpine",
  "projectId":"$DOKPLOY_PROJECT_ID"
}
JSON
)"
echo ""

echo "▶ Creando Redis cedgym-redis…"
API -X POST "$DOKPLOY_URL/api/redis.create" -d "$(cat <<JSON
{
  "name":"cedgym-redis",
  "appName":"cedgym-redis",
  "dockerImage":"redis:7-alpine",
  "projectId":"$DOKPLOY_PROJECT_ID"
}
JSON
)"
echo ""

echo "▶ Creando Application cedgym-api…"
API -X POST "$DOKPLOY_URL/api/application.create" -d "$(cat <<JSON
{
  "name":"cedgym-api",
  "appName":"cedgym-api",
  "projectId":"$DOKPLOY_PROJECT_ID",
  "sourceType":"github",
  "repository":"$GITHUB_REPO",
  "branch":"main",
  "buildType":"dockerfile",
  "dockerfile":"apps/api/Dockerfile",
  "buildPath":"/"
}
JSON
)"
echo ""

cat <<EOF

⚠️  Nota: la API de Dokploy cambia entre versiones. Si alguno de los POSTs
    devolvió error, abrir el panel y crear el recurso manualmente siguiendo
    deploy/DEPLOY.md y deploy/PRODUCTION.md.

Envs para pegar (cedgym-api):
  DATABASE_URL=postgresql://cedgym:$POSTGRES_PASSWORD@cedgym-db:5432/cedgym
  REDIS_URL=redis://cedgym-redis:6379
  JWT_SECRET=$JWT_SECRET
  JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET
  MP_ACCESS_TOKEN=$MP_ACCESS_TOKEN
  MP_PUBLIC_KEY=$MP_PUBLIC_KEY
  MP_WEBHOOK_SECRET=$MP_WEBHOOK_SECRET
  WHATSAPP_BOT_URL=http://cedgym-whatsapp-bot:3002
  WHATSAPP_BOT_KEY=$WHATSAPP_BOT_KEY
  API_PORT=3001
  API_HOST=0.0.0.0
  NODE_ENV=production
  API_PUBLIC_URL=https://api.187-77-11-79.sslip.io
  CORS_ORIGINS=https://cedgym.vercel.app,http://localhost:3000
EOF
