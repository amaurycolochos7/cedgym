#!/usr/bin/env bash
#
# staging-rehearsal.sh
#
# Coach-templates v1 staging rehearsal driver.
#
# WARNING: Each call generates a real routine/plan and ROTATES OUT the user's
# previously active one — only run on disposable test users.
#
# Usage:
#   STAGING_BASE_URL=https://api.187-77-11-79.sslip.io \
#   STAGING_JWT_R1=eyJ... STAGING_JWT_R2=eyJ... ... STAGING_JWT_M4=eyJ... \
#       bash scripts/staging-rehearsal.sh
#
#   # or, if you keep the env in a file:
#   STAGING_ENV_FILE=./.env.staging bash scripts/staging-rehearsal.sh
#
# Dependencies: bash, curl, jq (no others). Portable to Linux & macOS.
#
set -euo pipefail

# ---------- 0. Optional: source env file ------------------------------------
if [[ -n "${STAGING_ENV_FILE:-}" ]]; then
  if [[ ! -f "$STAGING_ENV_FILE" ]]; then
    echo "ERROR: STAGING_ENV_FILE points to '$STAGING_ENV_FILE' but file does not exist." >&2
    exit 1
  fi
  # shellcheck disable=SC1090
  set -a; source "$STAGING_ENV_FILE"; set +a
fi

# ---------- 1. Validate required env ----------------------------------------
REQUIRED_VARS=(
  STAGING_BASE_URL
  STAGING_JWT_R1 STAGING_JWT_R2 STAGING_JWT_R3 STAGING_JWT_R4
  STAGING_JWT_M1 STAGING_JWT_M2 STAGING_JWT_M3 STAGING_JWT_M4
)

MISSING=()
for v in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!v:-}" ]]; then
    MISSING+=("$v")
  fi
done

if (( ${#MISSING[@]} > 0 )); then
  echo "ERROR: missing required environment variables:" >&2
  for v in "${MISSING[@]}"; do
    echo "  - $v" >&2
  done
  echo "" >&2
  echo "Either export them, or set STAGING_ENV_FILE=path/to/.env.staging" >&2
  echo "(see scripts/RUNBOOK.md → 'Required environment variables')." >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "ERROR: 'curl' not found in PATH." >&2; exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: 'jq' not found in PATH." >&2; exit 1
fi

# ---------- 2. Prepare output dir -------------------------------------------
OUT_DIR="${OUT_DIR:-./out}"
mkdir -p "$OUT_DIR"

BASE="${STAGING_BASE_URL%/}"

echo "==> staging rehearsal starting"
echo "    base url : $BASE"
echo "    out dir  : $OUT_DIR"
echo ""

# ---------- 3. Profile definitions ------------------------------------------
# Pipe-separated: id|endpoint|jwt-var-name|json-body
PROFILES=(
  'R1|/ai/routines/generate|STAGING_JWT_R1|{"location":"GYM","days_per_week":5,"objective":"MUSCLE_GAIN","level":"INTERMEDIATE","user_type":"ADULT"}'
  'R2|/ai/routines/generate|STAGING_JWT_R2|{"location":"GYM","days_per_week":5,"objective":"MUSCLE_GAIN","level":"INTERMEDIATE","user_type":"ADULT"}'
  'R3|/ai/routines/generate|STAGING_JWT_R3|{"location":"HOME","days_per_week":3,"objective":"MUSCLE_GAIN","level":"INTERMEDIATE","user_type":"ADULT"}'
  'R4|/ai/routines/generate|STAGING_JWT_R4|{"location":"GYM","days_per_week":3,"objective":"GENERAL_FITNESS","level":"BEGINNER","user_type":"SENIOR","injuries":["rodilla"]}'
  'M1|/ai/meal-plans/generate|STAGING_JWT_M1|{"objective":"MUSCLE_GAIN","meals_per_day":5,"country":"MX","allergies":["cacahuate"]}'
  'M2|/ai/meal-plans/generate|STAGING_JWT_M2|{"objective":"MAINTENANCE","meals_per_day":4,"country":"MX"}'
  'M3|/ai/meal-plans/generate|STAGING_JWT_M3|{"objective":"WEIGHT_LOSS","meals_per_day":4,"country":"MX","disliked_foods":["hígado"]}'
  'M4|/ai/meal-plans/generate|STAGING_JWT_M4|{"objective":"STRENGTH","meals_per_day":4,"country":"MX"}'
)

# ---------- 4. Run each profile ---------------------------------------------
for entry in "${PROFILES[@]}"; do
  IFS='|' read -r ID PATH_ JWT_VAR BODY <<< "$entry"
  JWT="${!JWT_VAR}"
  URL="$BASE$PATH_"

  RESP_FILE="$OUT_DIR/$ID.json"
  CODE_FILE="$OUT_DIR/$ID.code"

  # Tolerate failures so one bad profile doesn't abort the rest.
  RAW=$(curl -sS -X POST "$URL" \
    -H "Authorization: Bearer $JWT" \
    -H "Content-Type: application/json" \
    -d "$BODY" \
    -w '\n%{http_code}' || true)

  # Split response body and HTTP code (last line is the code).
  HTTP_CODE=$(printf '%s' "$RAW" | awk 'END{print}')
  BODY_RESP=$(printf '%s' "$RAW" | sed '$d')

  printf '%s' "$BODY_RESP" > "$RESP_FILE"
  printf '%s' "$HTTP_CODE" > "$CODE_FILE"

  # Best-effort field extraction for the per-profile summary line.
  ATTEMPTS=$(printf '%s' "$BODY_RESP"  | jq -r '.attempts // .meta.attempts // "?"' 2>/dev/null || echo "?")
  USED_FB=$(printf '%s' "$BODY_RESP"   | jq -r '.used_fallback // .meta.used_fallback // "?"' 2>/dev/null || echo "?")
  TEMPLATE=$(printf '%s' "$BODY_RESP"  | jq -r '.template.id // .template_id // .meta.template.id // "?"' 2>/dev/null || echo "?")
  VALID_OK=$(printf '%s' "$BODY_RESP"  | jq -r '.validation_ok // .meta.validation_ok // "?"' 2>/dev/null || echo "?")

  printf '%s -> http %s  attempts=%s  used_fallback=%s  template=%s  validation_ok=%s\n' \
    "$ID" "$HTTP_CODE" "$ATTEMPTS" "$USED_FB" "$TEMPLATE" "$VALID_OK"
done

echo ""
echo "==> per-profile artifacts written to $OUT_DIR/"
echo ""

# ---------- 5. Aggregate summary table --------------------------------------
echo "==> summary table"
printf 'PROFILE | HTTP | template_id                       | attempts | validation_ok | used_fallback | cost_usd\n'
printf -- '--------+------+-----------------------------------+----------+---------------+---------------+----------\n'

for entry in "${PROFILES[@]}"; do
  IFS='|' read -r ID _PATH _JWT _BODY <<< "$entry"
  RESP_FILE="$OUT_DIR/$ID.json"
  CODE_FILE="$OUT_DIR/$ID.code"

  HTTP_CODE="?"
  if [[ -f "$CODE_FILE" ]]; then HTTP_CODE=$(cat "$CODE_FILE"); fi

  TEMPLATE="?"; ATTEMPTS="?"; VALID_OK="?"; USED_FB="?"; COST="?"
  if [[ -f "$RESP_FILE" ]]; then
    TEMPLATE=$(jq -r '.template.id // .template_id // .meta.template.id // "?"' "$RESP_FILE" 2>/dev/null || echo "?")
    ATTEMPTS=$(jq -r '.attempts // .meta.attempts // "?"' "$RESP_FILE" 2>/dev/null || echo "?")
    VALID_OK=$(jq -r '.validation_ok // .meta.validation_ok // "?"' "$RESP_FILE" 2>/dev/null || echo "?")
    USED_FB=$(jq -r  '.used_fallback // .meta.used_fallback // "?"' "$RESP_FILE" 2>/dev/null || echo "?")
    COST=$(jq -r     '.cost_usd // .meta.cost_usd // "?"' "$RESP_FILE" 2>/dev/null || echo "?")
  fi

  printf '%-7s | %-4s | %-33s | %-8s | %-13s | %-13s | %s\n' \
    "$ID" "$HTTP_CODE" "$TEMPLATE" "$ATTEMPTS" "$VALID_OK" "$USED_FB" "$COST"
done

echo ""
echo "==> done. Next step: bash scripts/extract-staging-metrics.sh $OUT_DIR"
