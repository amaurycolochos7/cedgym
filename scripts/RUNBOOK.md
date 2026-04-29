# Coach-Templates v1 — Staging Rehearsal Runbook

End-to-end checklist for flipping `COACH_TEMPLATES_V1=true` in staging,
running the 8-profile rehearsal, extracting metrics, and deciding
whether to roll forward or roll back.

**Audience:** the on-call engineer doing the staging cutover.
**Time budget:** ~20 min of human time + the call latencies.

---

## Prerequisites

- `bash` 4+ (Linux) or 3.2+ (macOS default — scripts are written portably).
- `curl` and `jq` on PATH.
- Network access to the staging API host.
- 8 disposable test users on staging (see section 3 below).
- Access to Dokploy (to flip the env var).
- (Optional) Access to the API container logs if you want the Pino-grep
  signals in the metrics report.

---

## 1. Pre-flight checklist

Tick all of these BEFORE flipping the flag in Dokploy.

- [ ] `coach-templates/v1` deploy is live in staging at the expected commit.
- [ ] `COACH_TEMPLATES_V1` is currently **`false`** (or unset) in the staging
      service env. Confirm in Dokploy → service → Environment.
- [ ] `COACH_TEMPLATES_TRACKING_DB` is **NOT** set yet — that flag only flips
      after the tracking-table migration has been applied separately.
- [ ] You have 8 disposable test users seeded with reasonable profile data
      (DOB, weight, height, gender, goal). 4 will be used for routines (R1–R4)
      and 4 for meal plans (M1–M4).
- [ ] The 8 users have **no critical** active routines/plans you care about —
      each rehearsal call rotates the active one out.
- [ ] `STAGING_BASE_URL` is reachable (try a `curl -s -o /dev/null -w '%{http_code}\n'
      "$STAGING_BASE_URL/health"`).
- [ ] OpenAI API key is configured for the staging environment and has
      headroom for ~24 generations (8 profiles × up to 3 attempts).
- [ ] Redis is up (the templates cache + AI cost meter rely on it).

---

## 2. Required environment variables

The rehearsal script reads 9 env vars. You can either `export` them in
your shell or write them to a file and pass `STAGING_ENV_FILE=...`.

### `.env.staging.example`

```bash
# Base URL of the staging API (no trailing slash).
STAGING_BASE_URL=https://api.187-77-11-79.sslip.io
# or:
# STAGING_BASE_URL=https://api.cedgym.mx

# Routine test users (4 different profiles; gender on DB drives R1 vs R2).
STAGING_JWT_R1=eyJhbGciOi...   # adult male,   GYM,  5d, MUSCLE_GAIN, INTERMEDIATE
STAGING_JWT_R2=eyJhbGciOi...   # adult female, GYM,  5d, MUSCLE_GAIN, INTERMEDIATE
STAGING_JWT_R3=eyJhbGciOi...   # adult,        HOME, 3d, MUSCLE_GAIN, INTERMEDIATE
STAGING_JWT_R4=eyJhbGciOi...   # senior,       GYM,  3d, GENERAL_FITNESS, BEGINNER, knee injury

# Meal-plan test users.
STAGING_JWT_M1=eyJhbGciOi...   # MUSCLE_GAIN,  5 meals, MX, peanut allergy
STAGING_JWT_M2=eyJhbGciOi...   # MAINTENANCE,  4 meals, MX
STAGING_JWT_M3=eyJhbGciOi...   # WEIGHT_LOSS,  4 meals, MX, dislikes liver
STAGING_JWT_M4=eyJhbGciOi...   # STRENGTH,     4 meals, MX
```

> Copy this block to `.env.staging` and fill in the JWTs. **Do not commit
> the filled file** — `.env.staging` should be gitignored alongside
> `.env*` patterns already in the repo.

---

## 3. How to obtain the 8 JWTs

Pick whichever is fastest for you:

### Option A — Browser network tab (recommended, ~2 min)

1. Open the staging frontend in an incognito window.
2. Log in as the test user.
3. DevTools → Network → click any authenticated request → copy the
   `Authorization: Bearer …` header value (everything after `Bearer `).
4. Repeat for all 8 users.

### Option B — Direct login endpoint

```bash
curl -s -X POST "$STAGING_BASE_URL/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"r1@test.cedgym.mx","password":"…"}' \
  | jq -r '.access_token'
```

### Option C — `gh secret set` if you keep them in a repo Actions secret

```bash
gh secret set STAGING_JWT_R1 -b "eyJhbGciOi..."
```

(then later `export STAGING_JWT_R1="$(gh secret get …)"` style — usually
overkill for a one-shot rehearsal.)

---

## 4. How to flip the flag

1. Open Dokploy → the staging API service → **Environment**.
2. Add or set:

   ```
   COACH_TEMPLATES_V1=true
   ```

   Do **NOT** set `COACH_TEMPLATES_TRACKING_DB=true` yet — that requires
   the tracking-table migration to run first, which is a separate change.
3. Click **Save** then **Redeploy**.
4. Wait until the deployment is `Running` and `/health` returns 200.
5. Tail logs for ~30s to confirm no boot-time errors:
   `docker logs -f <container>` (or via Dokploy's log viewer).

---

## 5. Run the rehearsal

From the repo root:

```bash
# Either inline:
export STAGING_BASE_URL=https://api.187-77-11-79.sslip.io
export STAGING_JWT_R1=eyJ...
# ...

bash scripts/staging-rehearsal.sh

# Or via env file:
STAGING_ENV_FILE=./.env.staging bash scripts/staging-rehearsal.sh
```

Expected stdout (truncated):

```
==> staging rehearsal starting
    base url : https://api.187-77-11-79.sslip.io
    out dir  : ./out

R1 -> http 201  attempts=1  used_fallback=false  template=rt-hombre-real-5d-musclegain  validation_ok=true
R2 -> http 201  attempts=1  used_fallback=false  template=rt-mujer-real-5d-musclegain   validation_ok=true
R3 -> http 201  attempts=1  used_fallback=false  template=rt-home-3d-musclegain         validation_ok=true
R4 -> http 201  attempts=2  used_fallback=false  template=rt-senior-3d-general          validation_ok=true
M1 -> http 201  attempts=1  used_fallback=false  template=mp-musclegain-5m-mx           validation_ok=true
M2 -> http 201  attempts=1  used_fallback=false  template=mp-maintenance-4m-mx          validation_ok=true
M3 -> http 201  attempts=1  used_fallback=false  template=mp-weightloss-4m-mx           validation_ok=true
M4 -> http 201  attempts=1  used_fallback=false  template=mp-strength-4m-mx             validation_ok=true

==> per-profile artifacts written to ./out/
==> summary table
PROFILE | HTTP | template_id                       | attempts | validation_ok | used_fallback | cost_usd
--------+------+-----------------------------------+----------+---------------+---------------+----------
R1      | 201  | rt-hombre-real-5d-musclegain      | 1        | true          | false         | 0.0021
...
```

Per-profile JSON is saved to `out/<id>.json` and the HTTP code to
`out/<id>.code`.

> The kcal-deviation block in the metrics report is **approximate**: it
> divides `plan.calories_target` evenly across `meals_per_day`. Real
> templates may weight breakfast vs dinner differently, so treat the
> per-meal deviation as a coarse signal, not a strict contract check.

---

## 6. Extract metrics

```bash
bash scripts/extract-staging-metrics.sh out/

# With Pino log greps (counts of "validation failed, retrying with feedback",
# "OpenAI threw", "AI_VALIDATION_FAILED"):
STAGING_LOG_FILE=/path/to/api-staging.log \
  bash scripts/extract-staging-metrics.sh out/
```

Output is a markdown block — copy/paste into the rollout PR comment or
the Slack thread.

---

## 7. Interpretation thresholds

Compare the metrics report against these gates (from FASE 3 closing):

| Metric           | Green       | Yellow (watch) | Red (rollback)            |
|------------------|-------------|----------------|---------------------------|
| % retry          | < 15%       | 15–30%         | **> 30%**                 |
| % HTTP 422       | < 2%        | 2–8%           | **> 8%**                  |
| avg cost (USD)   | 0.002–0.004 | 0.004–0.008    | **> 0.008**               |
| % used_fallback  | < 1%        | 1–5%           | **> 5%**                  |

If **any** metric is red → execute rollback (section 8).
Yellow means proceed, but capture the report and re-run the rehearsal in
24h before the prod cutover.

---

## 8. Rollback procedure

No data migration is required — v1 is a pure code path that wraps the
existing persistence.

1. Dokploy → staging API service → **Environment**.
2. Set `COACH_TEMPLATES_V1=false` (or remove the variable).
3. Click **Save** then **Redeploy**.
4. Confirm `/health` returns 200 and a fresh routine generation falls
   back to the legacy path.

> Active routines/plans created during the rehearsal **stay valid** —
> they were persisted via the same legacy persistence call and are
> indistinguishable from pre-flag rows once the flag is off.

---

## 9. Escalation contacts / what NOT to do

**Contacts**

- API on-call: see `#cedgym-eng-oncall` Slack channel.
- AI / templates lead: ping `@ai-team` in `#cedgym-coach-templates`.

**Hard "don'ts"**

- **Do not** push to prod (`prod` branch / Dokploy prod service) until
  the staging numbers are green AND have been replayed at least once.
- **Do not** apply the tracking-table migration (`COACH_TEMPLATES_TRACKING_DB=true`)
  until the staging report has at least one all-green run; the tracking
  table is purely additive but it locks us into a reverse migration if
  we ship it broken.
- **Do not** run `staging-rehearsal.sh` against real users — the 8 JWTs
  must belong to disposable test accounts because every call rotates
  the active routine/plan.
- **Do not** swallow non-2xx responses — `out/<id>.json` and
  `out/<id>.code` are the source of truth, keep them on disk for the PR.
