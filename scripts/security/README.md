# BOLA test harness

Runnable cross-tenant access checks for the API. Asserts that
tenant-scoped endpoints return **404** when an actor from workspace B
tries to touch a resource belonging to workspace A — not 403, not 200,
not 500.

The 404 (instead of 403) is intentional: it hides the existence of
resources in other workspaces, blocking the BOLA-by-enumeration angle.

## Run

```bash
pnpm test:bola                                          # local API on :3001
API_URL=https://api.187-77-11-79.sslip.io pnpm test:bola  # against prod
BOLA_DRY_RUN=1 pnpm test:bola                           # list cases without HTTP
```

Exit code is non-zero if any case fails. Wire that into CI to keep the
guarantee from rotting.

## Adding a new case

When you migrate a new tenant-scoped route to `tenant-guard.js`,
append at least:

1. **One positive control** — the in-tenant actor calls the route and
   gets 2xx. Confirms you didn't accidentally lock yourself out.
2. **One cross-tenant negative** — the out-of-tenant actor calls the
   same route with a real id that exists in workspace A. Must get
   404. If it returns 403 you're leaking existence; fix the guard.

Cases live in `buildCases()` in `bola-runner.mjs`. Each case is:

```js
{
    name: 'short human description',
    actor: 'admin_a' | 'admin_b' | 'athlete_a' | 'athlete_b',
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: '/admin/...',
    expectStatus: 404,    // or 200 for positives
    body: { /* optional JSON body for POST/PATCH */ },
}
```

## Fixtures

`bola-fixtures.json` holds the test workspace ids, the admin/athlete
credentials, and a couple of pre-seeded resource ids (payment,
measurement). These are **test users in production** — created by the
e2e seed under workspace `gym-test-bola`. They are **not** real customer
accounts. Committing them is intentional so CI can authenticate without
needing a separate secret store.

If you ever delete the test workspace, regenerate fixtures with:

```bash
node apps/api/scripts/seed-bola-fixtures.js > scripts/security/bola-fixtures.json
```

(Script does not exist yet — write it the first time you re-seed.)
