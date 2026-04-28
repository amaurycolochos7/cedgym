#!/usr/bin/env node
// ─── BOLA test harness ──────────────────────────────────────────
// Plain Node 20+, no test framework, no deps. Runs cross-tenant
// access attempts against tenant-scoped endpoints and asserts the
// API returns 404 (existence-hiding), not 403 / 200 / 500.
//
// Run:           pnpm test:bola
// Override URL:  API_URL=https://api.187-77-11-79.sslip.io pnpm test:bola
// Dry run:       BOLA_DRY_RUN=1 pnpm test:bola      # only prints the cases
//
// When you migrate a new tenant-scoped route to tenant-guard, add
// ONE positive control + AT LEAST ONE cross-tenant negative case
// here. CI fails the whole sprint if any case fails.
// ────────────────────────────────────────────────────────────────

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = path.join(__dirname, 'bola-fixtures.json');

const c = {
    reset: '\x1b[0m',
    red:   '\x1b[31m',
    green: '\x1b[32m',
    yellow:'\x1b[33m',
    cyan:  '\x1b[36m',
    bold:  '\x1b[1m',
    dim:   '\x1b[2m',
};

function log(...a) { process.stdout.write(a.join(' ') + '\n'); }
function err(...a) { process.stderr.write(a.join(' ') + '\n'); }

async function main() {
    const fixturesRaw = await fs.readFile(FIXTURES_PATH, 'utf8');
    const fixtures = JSON.parse(fixturesRaw);
    const API_URL = (process.env.API_URL || fixtures.api_url || 'http://localhost:3001')
        .replace(/\/$/, '');
    const DRY_RUN = process.env.BOLA_DRY_RUN === '1';

    log(`${c.bold}BOLA harness${c.reset}  ${c.dim}→${c.reset} ${API_URL}`);
    if (DRY_RUN) log(`${c.yellow}(dry run — no HTTP, just enumerate cases)${c.reset}`);

    // Login each actor once. Cache tokens.
    const tokens = {};
    if (!DRY_RUN) {
        for (const actorKey of ['admin_a', 'admin_b', 'athlete_a', 'athlete_b']) {
            const actor = fixtures[actorKey];
            if (!actor) continue;
            const res = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ email: actor.email, password: actor.password }),
            }).catch((e) => ({ ok: false, status: 0, _err: e }));
            if (!res.ok) {
                err(`${c.red}✗${c.reset} login failed for ${actorKey}: HTTP ${res.status}${res._err ? ' ('+res._err.message+')' : ''}`);
                process.exit(2);
            }
            const body = await res.json();
            const token = body.access_token || body.token;
            if (!token) {
                err(`${c.red}✗${c.reset} login response for ${actorKey} did not include a token`);
                process.exit(2);
            }
            tokens[actorKey] = token;
        }
        log(`${c.dim}Logged in: ${Object.keys(tokens).join(', ')}${c.reset}\n`);
    }

    const cases = buildCases(fixtures);

    let pass = 0;
    let fail = 0;
    let skipped = 0;

    for (const tc of cases) {
        if (DRY_RUN) {
            log(`  ${c.dim}·${c.reset} ${tc.name}  ${c.dim}[${tc.method} ${tc.path} → expect ${tc.expectStatus}]${c.reset}`);
            continue;
        }
        const token = tokens[tc.actor];
        if (!token) {
            log(`  ${c.yellow}~ SKIP${c.reset} ${tc.name} (no token for ${tc.actor})`);
            skipped++;
            continue;
        }
        const res = await fetch(`${API_URL}${tc.path}`, {
            method: tc.method,
            headers: {
                'authorization': `Bearer ${token}`,
                'content-type': 'application/json',
            },
            body: tc.body ? JSON.stringify(tc.body) : undefined,
        }).catch((e) => ({ status: 0, _err: e }));

        const ok = res.status === tc.expectStatus;
        if (ok) {
            pass++;
            log(`  ${c.green}✓${c.reset} ${tc.name}  ${c.dim}(${tc.method} ${tc.path} → ${res.status})${c.reset}`);
        } else {
            fail++;
            log(`  ${c.red}✗ FAIL${c.reset} ${tc.name}  ${c.dim}(${tc.method} ${tc.path}, got ${res.status}, want ${tc.expectStatus})${c.reset}`);
        }
    }

    log('');
    log(`${c.bold}${pass} pass${c.reset}, ${fail > 0 ? c.red : c.dim}${fail} fail${c.reset}, ${c.dim}${skipped} skip${c.reset}, ${cases.length} total`);
    if (fail > 0) process.exit(1);
}

// ────────────────────────────────────────────────────────────────
// Test cases — covers the 4 routes migrated in tenant-guard phase 1.
// Add one positive + one negative per new route as phase 2 lands.
// ────────────────────────────────────────────────────────────────
function buildCases(f) {
    const wsA = f.workspace_a;
    const wsB = f.workspace_b;
    const adminA = f.admin_a;
    const adminB = f.admin_b;
    const athleteA = f.athlete_a;
    const athleteB = f.athlete_b;
    const paymentA = f.payment_a_id;
    const paymentB = f.payment_b_id;
    const measurementB = f.measurement_b_id;
    const sentinel = '00000000aaaa0000bbbb00000000cccc';

    return [
        // ─── admin-members ─────────────────────────────────────
        {
            name: 'admin_b cannot GET admin_a (cross-tenant member fetch)',
            actor: 'admin_b', method: 'GET',
            path: `/admin/miembros/${adminA.id}`,
            expectStatus: 404,
        },
        {
            name: 'admin_b cannot DELETE athlete_a (cross-tenant member delete)',
            actor: 'admin_b', method: 'DELETE',
            path: `/admin/miembros/${athleteA.id}`,
            expectStatus: 404,
        },
        {
            name: 'admin_a CAN GET athlete_a (positive control)',
            actor: 'admin_a', method: 'GET',
            path: `/admin/miembros/${athleteA.id}`,
            expectStatus: 200,
        },

        // ─── admin-staff ───────────────────────────────────────
        {
            name: 'admin_b cannot GET admin_a as staff row (cross-tenant)',
            actor: 'admin_b', method: 'GET',
            path: `/admin/staff/${adminA.id}`,
            expectStatus: 404,
        },
        {
            name: 'admin_a CAN GET staff list of own workspace',
            actor: 'admin_a', method: 'GET',
            path: `/admin/staff`,
            expectStatus: 200,
        },

        // ─── measurements ──────────────────────────────────────
        {
            name: 'admin_a cannot read measurement_b (cross-tenant measurement)',
            actor: 'admin_a', method: 'GET',
            path: `/admin/measurements/${athleteB.id}`,
            expectStatus: 404,
        },
        {
            name: 'admin_b CAN read measurements for athlete_b (own ws)',
            actor: 'admin_b', method: 'GET',
            path: `/admin/measurements/${athleteB.id}`,
            expectStatus: 200,
        },

        // ─── payments ──────────────────────────────────────────
        {
            name: 'admin_b cannot GET payment_a (cross-tenant payment)',
            actor: 'admin_b', method: 'GET',
            path: `/admin/payments/${paymentA}`,
            expectStatus: 404,
        },
        {
            name: 'admin_a CAN GET payment_a (positive control)',
            actor: 'admin_a', method: 'GET',
            path: `/admin/payments/${paymentA}`,
            expectStatus: 200,
        },
        {
            name: 'athlete_a cannot GET payment_b (different ws + not owner)',
            actor: 'athlete_a', method: 'GET',
            path: `/admin/payments/${paymentB}`,
            // 404 (cross-tenant guard) OR 401/403 (athlete not staff). Either
            // is "not leaked" — test as 404 since the endpoint is admin-only
            // and tenant-guard maps all denial to NOT_FOUND.
            expectStatus: 404,
        },

        // ─── sentinel id (does not exist anywhere) ─────────────
        {
            name: 'admin_a fetching a non-existent member id → 404 (sanity)',
            actor: 'admin_a', method: 'GET',
            path: `/admin/miembros/${sentinel}`,
            expectStatus: 404,
        },
    ];
}

main().catch((e) => {
    err(`${c.red}harness crashed:${c.reset} ${e.stack || e.message}`);
    process.exit(2);
});
