#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# CED-GYM — Smoke test del deploy.
#
# Uso:
#   bash deploy/check-deploy.sh                            # host por defecto
#   bash deploy/check-deploy.sh 187.77.11.79               # override host
#   FRONT_URL=https://cedgym.vercel.app bash deploy/check-deploy.sh
# ═══════════════════════════════════════════════════════════════

set -e

HOST=${1:-187.77.11.79}
FRONT_URL=${FRONT_URL:-https://cedgym.vercel.app}

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok()   { echo -e "${GREEN}OK${NC}  $1"; }
warn() { echo -e "${YELLOW}WARN${NC} $1"; }
fail() { echo -e "${RED}FAIL${NC} $1"; exit 1; }

echo "→ Checking CED-GYM stack on host $HOST"
echo ""

# ─── API ────────────────────────────────────────────────
echo "→ API health (http://$HOST:3001/health) ..."
if curl -fsS --max-time 10 "http://$HOST:3001/health" > /tmp/cedgym-api-health 2>&1; then
  ok "API responde"
  cat /tmp/cedgym-api-health
  echo ""
else
  fail "API no responde en $HOST:3001"
fi

# ─── WhatsApp bot ───────────────────────────────────────
echo "→ WhatsApp bot health (http://$HOST:3002/health) ..."
if curl -fsS --max-time 10 "http://$HOST:3002/health" > /tmp/cedgym-wa-health 2>&1; then
  ok "WhatsApp bot responde"
  cat /tmp/cedgym-wa-health
  echo ""
else
  warn "WhatsApp bot no responde (puede estar arrancando Chromium, reintentá en 30s)"
fi

# ─── Frontend ───────────────────────────────────────────
echo "→ Frontend ($FRONT_URL) ..."
CODE=$(curl -fsS -o /dev/null -w "%{http_code}" --max-time 10 "$FRONT_URL" || echo "000")
if [ "$CODE" = "200" ] || [ "$CODE" = "301" ] || [ "$CODE" = "308" ]; then
  ok "Frontend up (HTTP $CODE)"
else
  warn "Frontend respondió HTTP $CODE — revisá Vercel dashboard"
fi

# ─── CORS check ─────────────────────────────────────────
echo ""
echo "→ CORS preflight (API ← $FRONT_URL) ..."
CORS=$(curl -fsS -o /dev/null -w "%{http_code}" -X OPTIONS \
  -H "Origin: $FRONT_URL" \
  -H "Access-Control-Request-Method: GET" \
  --max-time 10 \
  "http://$HOST:3001/health" || echo "000")
if [ "$CORS" = "204" ] || [ "$CORS" = "200" ]; then
  ok "CORS OK (HTTP $CORS)"
else
  warn "CORS preflight devolvió HTTP $CORS — verificá CORS_ORIGINS en el API"
fi

# ─── Puertos internos que NO deberían estar expuestos ──
echo ""
echo "→ Verificando que DB/Redis NO estén expuestos..."
for PORT in 5432 6379; do
  if timeout 3 bash -c "echo > /dev/tcp/$HOST/$PORT" 2>/dev/null; then
    warn "Puerto $PORT ESTÁ abierto desde internet — debería estar en red interna"
  else
    ok "Puerto $PORT cerrado (correcto)"
  fi
done

echo ""
echo "─────────────────────────────────────────────"
echo "Deploy check completo."
