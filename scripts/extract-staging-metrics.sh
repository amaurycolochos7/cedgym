#!/usr/bin/env bash
#
# extract-staging-metrics.sh
#
# Aggregates the *.json artifacts produced by staging-rehearsal.sh
# into a markdown report block (paste into Slack / PR comment).
#
# Usage:
#   bash scripts/extract-staging-metrics.sh [out-dir]
#   STAGING_LOG_FILE=/path/to/api.log bash scripts/extract-staging-metrics.sh out
#
# Dependencies: bash, jq, awk, grep (no others). Portable to Linux & macOS.
#
set -euo pipefail

DIR="${1:-./out}"

if [[ ! -d "$DIR" ]]; then
  echo "ERROR: directory '$DIR' not found." >&2
  echo "Run scripts/staging-rehearsal.sh first." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: 'jq' not found in PATH." >&2; exit 1
fi

shopt -s nullglob
JSON_FILES=( "$DIR"/*.json )
if (( ${#JSON_FILES[@]} == 0 )); then
  echo "ERROR: no *.json files in '$DIR'." >&2
  exit 1
fi

# ---------- helpers ---------------------------------------------------------
get_field() {
  # $1 = file, $2 = jq expression
  jq -r "$2 // empty" "$1" 2>/dev/null || true
}

pct() {
  # $1 = numerator, $2 = denominator -> "12.5"
  awk -v n="$1" -v d="$2" 'BEGIN{ if (d==0) print "0.0"; else printf "%.1f", (n/d)*100 }'
}

# ---------- counters --------------------------------------------------------
TOTAL=0
SUCCESS_2XX=0
HTTP_422=0
OTHER_ERR=0

ATT_1=0
ATT_2=0
ATT_OTHER=0

VAL_OK_TRUE=0
VAL_OK_FALSE=0

USED_FB_TRUE=0

declare -A TEMPLATE_COUNT=()

# meal kcal-deviation accumulators
DEV_MIN=""
DEV_MAX=""
DEV_SUM="0"
DEV_N=0

for f in "${JSON_FILES[@]}"; do
  ID_BASE=$(basename "$f" .json)
  CODE_FILE="$DIR/$ID_BASE.code"

  HTTP="?"
  if [[ -f "$CODE_FILE" ]]; then HTTP=$(cat "$CODE_FILE"); fi

  TOTAL=$((TOTAL+1))

  case "$HTTP" in
    2??) SUCCESS_2XX=$((SUCCESS_2XX+1)) ;;
    422) HTTP_422=$((HTTP_422+1)) ;;
    *)   OTHER_ERR=$((OTHER_ERR+1)) ;;
  esac

  ATT=$(get_field "$f" '.attempts // .meta.attempts')
  case "$ATT" in
    1) ATT_1=$((ATT_1+1)) ;;
    2) ATT_2=$((ATT_2+1)) ;;
    *) ATT_OTHER=$((ATT_OTHER+1)) ;;
  esac

  VOK=$(get_field "$f" '.validation_ok // .meta.validation_ok')
  case "$VOK" in
    true)  VAL_OK_TRUE=$((VAL_OK_TRUE+1)) ;;
    false) VAL_OK_FALSE=$((VAL_OK_FALSE+1)) ;;
  esac

  UFB=$(get_field "$f" '.used_fallback // .meta.used_fallback')
  if [[ "$UFB" == "true" ]]; then
    USED_FB_TRUE=$((USED_FB_TRUE+1))
  fi

  TID=$(get_field "$f" '.template.id // .template_id // .meta.template.id')
  if [[ -n "$TID" ]]; then
    TEMPLATE_COUNT["$TID"]=$(( ${TEMPLATE_COUNT["$TID"]:-0} + 1 ))
  fi

  # ---------- meal kcal-deviation (best effort) -----------------------------
  # Approximation: per-meal target = plan.calories_target / meals_per_day
  # If those keys aren't present we silently skip.
  PCALS=$(get_field "$f" '.plan.calories_target // .calories_target // .meta.calories_target')
  MPD=$(get_field "$f" '.plan.meals_per_day // .meals_per_day // .meta.meals_per_day')

  if [[ -n "$PCALS" && -n "$MPD" && "$MPD" =~ ^[0-9]+$ && "$MPD" -gt 0 ]]; then
    DEVS=$(jq -r --argjson tot "$PCALS" --argjson n "$MPD" '
      ( .plan.meals // .meals // [] )
      | map(.calories // .kcal // empty)
      | map(select(type=="number"))
      | map( ((. - ($tot/$n)) / ($tot/$n)) * 100 | fabs )
      | .[]
    ' "$f" 2>/dev/null || true)

    while IFS= read -r d; do
      [[ -z "$d" ]] && continue
      DEV_N=$((DEV_N+1))
      DEV_SUM=$(awk -v a="$DEV_SUM" -v b="$d" 'BEGIN{printf "%.4f", a+b}')
      if [[ -z "$DEV_MIN" ]] || awk -v a="$d" -v b="$DEV_MIN" 'BEGIN{exit !(a<b)}'; then
        DEV_MIN="$d"
      fi
      if [[ -z "$DEV_MAX" ]] || awk -v a="$d" -v b="$DEV_MAX" 'BEGIN{exit !(a>b)}'; then
        DEV_MAX="$d"
      fi
    done <<< "$DEVS"
  fi
done

# ---------- derived percentages --------------------------------------------
PCT_ATT_1=$(pct "$ATT_1" "$TOTAL")
PCT_ATT_2=$(pct "$ATT_2" "$TOTAL")
PCT_VAL_OK=$(pct "$VAL_OK_TRUE" "$TOTAL")
PCT_VAL_NOK=$(pct "$VAL_OK_FALSE" "$TOTAL")
PCT_FB=$(pct "$USED_FB_TRUE" "$TOTAL")
PCT_422=$(pct "$HTTP_422" "$TOTAL")
PCT_2XX=$(pct "$SUCCESS_2XX" "$TOTAL")

if (( DEV_N > 0 )); then
  DEV_AVG=$(awk -v s="$DEV_SUM" -v n="$DEV_N" 'BEGIN{printf "%.1f", s/n}')
  DEV_MIN_FMT=$(awk -v v="$DEV_MIN" 'BEGIN{printf "%.1f", v}')
  DEV_MAX_FMT=$(awk -v v="$DEV_MAX" 'BEGIN{printf "%.1f", v}')
else
  DEV_AVG="n/a"; DEV_MIN_FMT="n/a"; DEV_MAX_FMT="n/a"
fi

# ---------- report ----------------------------------------------------------
cat <<EOF
# coach-templates v1 — staging rehearsal metrics

**Source:** \`$DIR/\` (${TOTAL} responses)

## HTTP

| metric           | count | pct    |
|------------------|-------|--------|
| total requests   | ${TOTAL} | 100.0% |
| HTTP 2xx         | ${SUCCESS_2XX} | ${PCT_2XX}% |
| HTTP 422         | ${HTTP_422} | ${PCT_422}% |
| other non-2xx    | ${OTHER_ERR} | $(pct "$OTHER_ERR" "$TOTAL")% |

## Attempts / validation / fallback

| metric                | count | pct    |
|-----------------------|-------|--------|
| attempts == 1         | ${ATT_1} | ${PCT_ATT_1}% |
| attempts == 2         | ${ATT_2} | ${PCT_ATT_2}% |
| attempts other/?      | ${ATT_OTHER} | $(pct "$ATT_OTHER" "$TOTAL")% |
| validation_ok = true  | ${VAL_OK_TRUE} | ${PCT_VAL_OK}% |
| validation_ok = false | ${VAL_OK_FALSE} | ${PCT_VAL_NOK}% |
| used_fallback = true  | ${USED_FB_TRUE} | ${PCT_FB}% |

## Template id distribution

EOF

if (( ${#TEMPLATE_COUNT[@]} == 0 )); then
  echo "_(no template ids parsed from responses)_"
else
  printf '| template_id | count |\n|---|---|\n'
  for k in "${!TEMPLATE_COUNT[@]}"; do
    printf '%s\t%s\n' "$k" "${TEMPLATE_COUNT[$k]}"
  done | sort -k2,2 -nr | awk -F'\t' '{printf "| %s | %s |\n", $1, $2}'
fi

cat <<EOF

## Meal kcal-deviation (per-meal, vs plan.calories_target / meals_per_day)

| stat | value |
|------|-------|
| min  | ${DEV_MIN_FMT}% |
| avg  | ${DEV_AVG}% |
| max  | ${DEV_MAX_FMT}% |
| samples | ${DEV_N} |

> Approximation: per-meal target is taken as \`plan.calories_target / meals_per_day\`
> (uniform split). Real templates may weight slots unevenly — treat as a
> coarse signal, not a contract check.

EOF

# ---------- optional log greps ---------------------------------------------
if [[ -n "${STAGING_LOG_FILE:-}" ]]; then
  if [[ ! -f "$STAGING_LOG_FILE" ]]; then
    echo "## Pino log signals"
    echo ""
    echo "_STAGING_LOG_FILE='$STAGING_LOG_FILE' not found — skipping._"
  else
    C_RETRY=$(grep -c 'validation failed, retrying with feedback' "$STAGING_LOG_FILE" || true)
    C_OAI=$(grep   -c 'OpenAI threw'                              "$STAGING_LOG_FILE" || true)
    C_VFAIL=$(grep -c 'AI_VALIDATION_FAILED'                      "$STAGING_LOG_FILE" || true)

    echo "## Pino log signals (\`$STAGING_LOG_FILE\`)"
    echo ""
    echo "| signal                                       | count |"
    echo "|----------------------------------------------|-------|"
    echo "| validation failed, retrying with feedback    | ${C_RETRY} |"
    echo "| OpenAI threw                                 | ${C_OAI} |"
    echo "| AI_VALIDATION_FAILED                         | ${C_VFAIL} |"
  fi
fi

cat <<'EOF'

---

_Compare against thresholds in `scripts/RUNBOOK.md` → "Interpretation thresholds"._
EOF
