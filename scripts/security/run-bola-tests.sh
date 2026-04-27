#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# BOLA / cross-tenant test runner.
#
# Reads fixtures from scripts/security/.bola-fixtures.json
# (produced by seed-bola-fixtures.mjs), logs in both admins
# and the test athlete, and runs A1–B16 + R1–R8 against the
# API. Prints pass/fail per case and a summary at the end.
#
# Exit code: 0 if every test passes, non-zero otherwise.
#
# Requirements: bash, curl, jq.
#
# Usage:
#   bash scripts/security/run-bola-tests.sh
#   API_URL=https://api-staging.cedgym.mx bash scripts/security/run-bola-tests.sh
# ─────────────────────────────────────────────────────────────
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURES="${SCRIPT_DIR}/.bola-fixtures.json"

if ! command -v jq >/dev/null 2>&1; then
    echo "ERROR: jq is required. Install: https://stedolan.github.io/jq/" >&2
    exit 2
fi
if ! command -v curl >/dev/null 2>&1; then
    echo "ERROR: curl is required." >&2
    exit 2
fi
if [[ ! -f "$FIXTURES" ]]; then
    echo "ERROR: fixtures file not found at $FIXTURES" >&2
    echo "Run first: node scripts/security/seed-bola-fixtures.mjs > $FIXTURES" >&2
    exit 2
fi

API_URL="${API_URL:-$(jq -r '.api_url' "$FIXTURES")}"
ADMIN_A_EMAIL=$(jq -r '.admin_a.email' "$FIXTURES")
ADMIN_A_PASSWORD=$(jq -r '.admin_a.password' "$FIXTURES")
ADMIN_B_EMAIL=$(jq -r '.admin_b.email' "$FIXTURES")
ADMIN_B_PASSWORD=$(jq -r '.admin_b.password' "$FIXTURES")
ATHLETE_A_EMAIL=$(jq -r '.athlete_a.email' "$FIXTURES")
ATHLETE_A_PASSWORD=$(jq -r '.athlete_a.password' "$FIXTURES")
ATHLETE_A_ID=$(jq -r '.athlete_a.id' "$FIXTURES")
ATHLETE_B_ID=$(jq -r '.athlete_b.id' "$FIXTURES")
ADMIN_A_ID=$(jq -r '.admin_a.id' "$FIXTURES")
ADMIN_B_ID=$(jq -r '.admin_b.id' "$FIXTURES")
PAYMENT_A_ID=$(jq -r '.payment_a_id' "$FIXTURES")
PAYMENT_B_ID=$(jq -r '.payment_b_id' "$FIXTURES")

echo "API_URL = $API_URL"
echo "ADMIN_A = $ADMIN_A_EMAIL  (workspace A)"
echo "ADMIN_B = $ADMIN_B_EMAIL  (workspace B)"
echo "ATHLETE_A_ID = $ATHLETE_A_ID"
echo "ATHLETE_B_ID = $ATHLETE_B_ID"
echo

# ─── Login helper ─────────────────────────────────────────────
login() {
    local email="$1" password="$2"
    local resp
    resp=$(curl -s -X POST "$API_URL/auth/login" \
        -H 'Content-Type: application/json' \
        -d "{\"email\":\"$email\",\"password\":\"$password\"}")
    # Try common token shapes.
    local tok
    tok=$(echo "$resp" | jq -r '.access_token // .token // .data.access_token // empty')
    if [[ -z "$tok" || "$tok" == "null" ]]; then
        echo "LOGIN FAILED for $email" >&2
        echo "$resp" >&2
        return 1
    fi
    printf '%s' "$tok"
}

echo "→ Logging in ADMIN_A..."
TOKEN_A=$(login "$ADMIN_A_EMAIL" "$ADMIN_A_PASSWORD") || exit 3
echo "  ok"
echo "→ Logging in ADMIN_B..."
TOKEN_B=$(login "$ADMIN_B_EMAIL" "$ADMIN_B_PASSWORD") || exit 3
echo "  ok"
echo "→ Logging in ATHLETE_A..."
TOKEN_ATHLETE_A=$(login "$ATHLETE_A_EMAIL" "$ATHLETE_A_PASSWORD") || exit 3
echo "  ok"
echo

# ─── Generic case runner ──────────────────────────────────────
PASS=0
FAIL=0
FAILED_CASES=()

# run_case <ID> <description> <expected_status> <method> <path> [token] [body]
run_case() {
    local id="$1" desc="$2" expected="$3" method="$4" path="$5"
    local token="${6:-}" body="${7:-}"
    local args=(-s -o /dev/null -w '%{http_code}' -X "$method" "$API_URL$path")
    if [[ -n "$token" ]]; then
        args+=(-H "Authorization: Bearer $token")
    fi
    if [[ -n "$body" ]]; then
        args+=(-H 'Content-Type: application/json' -d "$body")
    fi
    local got
    got=$(curl "${args[@]}")
    if [[ "$got" == "$expected" ]]; then
        printf '  [PASS] %-4s %-60s expected=%s got=%s\n' "$id" "$desc" "$expected" "$got"
        PASS=$((PASS+1))
    else
        printf '  [FAIL] %-4s %-60s expected=%s got=%s\n' "$id" "$desc" "$expected" "$got"
        FAIL=$((FAIL+1))
        FAILED_CASES+=("$id: $desc (expected $expected, got $got)")
    fi
}

# Some cases have alternative acceptable status codes. Use 4xx-tolerant.
# run_case_either <ID> <desc> <expected_csv> <method> <path> [token] [body]
run_case_either() {
    local id="$1" desc="$2" expected_csv="$3" method="$4" path="$5"
    local token="${6:-}" body="${7:-}"
    local args=(-s -o /dev/null -w '%{http_code}' -X "$method" "$API_URL$path")
    [[ -n "$token" ]] && args+=(-H "Authorization: Bearer $token")
    [[ -n "$body"  ]] && args+=(-H 'Content-Type: application/json' -d "$body")
    local got
    got=$(curl "${args[@]}")
    if [[ ",$expected_csv," == *",$got,"* ]]; then
        printf '  [PASS] %-4s %-60s expected={%s} got=%s\n' "$id" "$desc" "$expected_csv" "$got"
        PASS=$((PASS+1))
    else
        printf '  [FAIL] %-4s %-60s expected={%s} got=%s\n' "$id" "$desc" "$expected_csv" "$got"
        FAIL=$((FAIL+1))
        FAILED_CASES+=("$id: $desc (expected one of $expected_csv, got $got)")
    fi
}

echo "═══ A1–A3: Control (debe responder 200) ═══════════════════════════════════"
run_case A1   "ADMIN_A reads OWN athlete"                    200 GET    "/admin/miembros/$ATHLETE_A_ID" "$TOKEN_A"
run_case A2   "ADMIN_A patches OWN athlete name"             200 PATCH  "/admin/miembros/$ATHLETE_A_ID" "$TOKEN_A" '{"name":"BOLA Test Name"}'
run_case A3a  "ADMIN_A suspends OWN athlete"                 200 POST   "/admin/miembros/$ATHLETE_A_ID/suspend"     "$TOKEN_A"
run_case A3b  "ADMIN_A reactivates OWN athlete"              200 POST   "/admin/miembros/$ATHLETE_A_ID/reactivate"  "$TOKEN_A"
echo

echo "═══ B1–B14: Cross-tenant attacks (deben responder 404 / 403 / 400) ════════"
run_case B1   "ADMIN_A reads athlete OF GYM B (BOLA)"        404 GET    "/admin/miembros/$ATHLETE_B_ID" "$TOKEN_A"
run_case B2   "ADMIN_A patches athlete OF GYM B (BOLA)"      404 PATCH  "/admin/miembros/$ATHLETE_B_ID" "$TOKEN_A" '{"status":"SUSPENDED"}'
run_case B3   "ADMIN_A suspends athlete OF GYM B (BOLA)"     404 POST   "/admin/miembros/$ATHLETE_B_ID/suspend"     "$TOKEN_A"
run_case B4   "ADMIN_A reactivates athlete OF GYM B (BOLA)"  404 POST   "/admin/miembros/$ATHLETE_B_ID/reactivate"  "$TOKEN_A"
run_case B5   "ADMIN_A patches staff OF GYM B (BOLA)"        404 PATCH  "/admin/staff/$ADMIN_B_ID" "$TOKEN_A" '{"name":"hacked"}'
run_case B6   "ADMIN_A reads payment OF GYM B (BOLA)"        404 GET    "/payments/$PAYMENT_B_ID" "$TOKEN_A"
run_case B8   "ADMIN_A reads measurements of GYM B (BOLA)"   404 GET    "/admin/measurements/$ATHLETE_B_ID" "$TOKEN_A"
run_case B9   "Unauthenticated request"                      401 GET    "/admin/miembros/$ATHLETE_A_ID"
run_case B11  "ADMIN_A escalates staff to SUPERADMIN"        403 PATCH  "/admin/staff/$ADMIN_A_ID" "$TOKEN_A" '{"role":"SUPERADMIN"}'
run_case B13  "PATCH with empty body returns NO_CHANGES"     400 PATCH  "/admin/miembros/$ATHLETE_A_ID" "$TOKEN_A" '{}'
run_case B14  "ADMIN_A tries to delete SELF (staff)"         400 DELETE "/admin/staff/$ADMIN_A_ID" "$TOKEN_A"
echo

echo "═══ B7: Listing isolation ════════════════════════════════════════════════"
# B7: ADMIN_A lists payments — must contain ONLY workspace A users.
PAYMENTS_RESP=$(curl -s -H "Authorization: Bearer $TOKEN_A" "$API_URL/admin/payments?limit=500")
PAYMENT_LEAK=$(echo "$PAYMENTS_RESP" | jq --arg b "$ATHLETE_B_ID" '
  .payments // [] | map(select(.user_id == $b)) | length
')
if [[ "$PAYMENT_LEAK" == "0" ]]; then
    echo "  [PASS] B7   payments listing excludes workspace B           leak_count=0"
    PASS=$((PASS+1))
else
    echo "  [FAIL] B7   payments listing LEAKED workspace B users       leak_count=$PAYMENT_LEAK"
    FAIL=$((FAIL+1))
    FAILED_CASES+=("B7: payments listing leaked $PAYMENT_LEAK rows from workspace B")
fi
echo

echo "═══ B12: Mass-assign role ignored ════════════════════════════════════════"
# Send a body with a forbidden field. Should succeed (200) but role unchanged.
PRE_ROLE=$(curl -s -H "Authorization: Bearer $TOKEN_A" "$API_URL/admin/miembros/$ATHLETE_A_ID" | jq -r '.role')
curl -s -o /dev/null -X PATCH \
    -H "Authorization: Bearer $TOKEN_A" \
    -H 'Content-Type: application/json' \
    -d '{"role":"ADMIN","name":"BOLA Test Name"}' \
    "$API_URL/admin/miembros/$ATHLETE_A_ID"
POST_ROLE=$(curl -s -H "Authorization: Bearer $TOKEN_A" "$API_URL/admin/miembros/$ATHLETE_A_ID" | jq -r '.role')
if [[ "$PRE_ROLE" == "$POST_ROLE" ]]; then
    echo "  [PASS] B12  role NOT escalated via PATCH body              role=$POST_ROLE"
    PASS=$((PASS+1))
else
    echo "  [FAIL] B12  role ESCALATED via PATCH body                  before=$PRE_ROLE  after=$POST_ROLE"
    FAIL=$((FAIL+1))
    FAILED_CASES+=("B12: role mass-assigned from $PRE_ROLE to $POST_ROLE")
fi
echo

echo "═══ B15–B16: Owner path ══════════════════════════════════════════════════"
run_case B15  "Athlete reads OWN payment"              200 GET "/payments/$PAYMENT_A_ID" "$TOKEN_ATHLETE_A"
run_case_either B16 "Athlete reads SOMEONE ELSE'S payment"  "403,404" GET "/payments/$PAYMENT_B_ID" "$TOKEN_ATHLETE_A"
echo

echo "═══ R1–R5: Smoke regression (non-admin flows) ════════════════════════════"
run_case R1  "Athlete lists own payments"          200 GET    "/payments/me"          "$TOKEN_ATHLETE_A"
run_case R2  "Athlete lists own measurements"      200 GET    "/measurements/me"      "$TOKEN_ATHLETE_A"
run_case R3  "Athlete creates self-measurement"    200 POST   "/measurements"         "$TOKEN_ATHLETE_A" '{"weight_kg":80}'
run_case R4  "Athlete cross-user measurement"      403 POST   "/measurements"         "$TOKEN_ATHLETE_A" "{\"user_id\":\"$ATHLETE_B_ID\",\"weight_kg\":80}"
run_case R6  "ADMIN_A lists OWN staff"             200 GET    "/admin/staff"          "$TOKEN_A"
echo

echo "════════════════════════════════════════════════════════════════════════════"
echo "RESULT:  PASS=$PASS  FAIL=$FAIL"
if [[ $FAIL -gt 0 ]]; then
    echo
    echo "Failed cases:"
    for c in "${FAILED_CASES[@]}"; do
        echo "  • $c"
    done
    exit 1
fi
echo "All tests passed ✅"
exit 0
