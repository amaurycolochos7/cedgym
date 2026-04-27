// ─────────────────────────────────────────────────────────────
// BOLA / cross-tenant test runner — pure Node, no deps.
// Uses native fetch (Node 20+).
//
// Reads fixtures from scripts/security/.bola-fixtures.json
// and runs A1–A3, B1–B16, R1–R6 against the API.
//
// Exit code: 0 if every test passes, 1 otherwise.
//
// Usage:
//   API_URL=http://localhost:3001 node scripts/security/run-bola-tests.mjs
// ─────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = path.join(__dirname, '.bola-fixtures.json');

if (!fs.existsSync(FIXTURES_PATH)) {
    console.error(`ERROR: fixtures file not found at ${FIXTURES_PATH}`);
    console.error('Run first: node scripts/security/seed-bola-fixtures.mjs > scripts/security/.bola-fixtures.json');
    process.exit(2);
}

const fx = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));
const API_URL = process.env.API_URL || fx.api_url || 'http://localhost:3001';

console.log(`API_URL = ${API_URL}`);
console.log(`ADMIN_A = ${fx.admin_a.email}  (workspace A)`);
console.log(`ADMIN_B = ${fx.admin_b.email}  (workspace B)`);
console.log(`ATHLETE_A_ID = ${fx.athlete_a.id}`);
console.log(`ATHLETE_B_ID = ${fx.athlete_b.id}`);
console.log();

// ─── Login helper ─────────────────────────────────────────────
async function login(email, password) {
    const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });
    const txt = await res.text();
    let body = {};
    try { body = JSON.parse(txt); } catch { /* keep empty */ }
    const token = body.access_token || body.token || body.data?.access_token;
    if (!token) {
        throw new Error(`LOGIN FAILED for ${email}: status=${res.status} body=${txt.slice(0, 300)}`);
    }
    return token;
}

const tokens = {};
async function loginAll() {
    process.stdout.write('→ Logging in ADMIN_A... ');
    tokens.A = await login(fx.admin_a.email, fx.admin_a.password);
    console.log('ok');
    process.stdout.write('→ Logging in ADMIN_B... ');
    tokens.B = await login(fx.admin_b.email, fx.admin_b.password);
    console.log('ok');
    process.stdout.write('→ Logging in ATHLETE_A... ');
    tokens.athleteA = await login(fx.athlete_a.email, fx.athlete_a.password);
    console.log('ok');
    console.log();
}

// ─── Case runner ──────────────────────────────────────────────
let pass = 0, fail = 0;
const failedCases = [];

async function runCase({ id, desc, expected, method, path: p, token, body, expectedSet }) {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const init = { method, headers };
    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
    }
    let got;
    try {
        const res = await fetch(`${API_URL}${p}`, init);
        got = res.status;
    } catch (e) {
        got = `ERR(${e.message})`;
    }
    const okSet = expectedSet ? expectedSet.includes(got) : got === expected;
    const expStr = expectedSet ? `{${expectedSet.join(',')}}` : String(expected);
    const tag = okSet ? '[PASS]' : '[FAIL]';
    const line = `  ${tag} ${id.padEnd(5)} ${desc.padEnd(60)} expected=${expStr} got=${got}`;
    console.log(line);
    if (okSet) pass++; else { fail++; failedCases.push(`${id}: ${desc} (expected ${expStr}, got ${got})`); }
}

async function header(t) { console.log(`═══ ${t} ${'═'.repeat(Math.max(0, 75 - t.length))}`); }

async function main() {
    await loginAll();

    await header('A1–A3: Control (debe responder 200)');
    await runCase({ id: 'A1',  desc: 'ADMIN_A reads OWN athlete',                  expected: 200, method: 'GET',   path: `/admin/miembros/${fx.athlete_a.id}`,                token: tokens.A });
    await runCase({ id: 'A2',  desc: 'ADMIN_A patches OWN athlete name',           expected: 200, method: 'PATCH', path: `/admin/miembros/${fx.athlete_a.id}`,                token: tokens.A, body: { name: 'BOLA Test Name' } });
    await runCase({ id: 'A3a', desc: 'ADMIN_A suspends OWN athlete',               expected: 200, method: 'POST',  path: `/admin/miembros/${fx.athlete_a.id}/suspend`,        token: tokens.A });
    await runCase({ id: 'A3b', desc: 'ADMIN_A reactivates OWN athlete',            expected: 200, method: 'POST',  path: `/admin/miembros/${fx.athlete_a.id}/reactivate`,     token: tokens.A });
    console.log();

    await header('B1–B14: Cross-tenant attacks (deben responder 404 / 403 / 400)');
    await runCase({ id: 'B1',  desc: 'ADMIN_A reads athlete OF GYM B (BOLA)',      expected: 404, method: 'GET',   path: `/admin/miembros/${fx.athlete_b.id}`,                token: tokens.A });
    await runCase({ id: 'B2',  desc: 'ADMIN_A patches athlete OF GYM B (BOLA)',    expected: 404, method: 'PATCH', path: `/admin/miembros/${fx.athlete_b.id}`,                token: tokens.A, body: { status: 'SUSPENDED' } });
    await runCase({ id: 'B3',  desc: 'ADMIN_A suspends athlete OF GYM B (BOLA)',   expected: 404, method: 'POST',  path: `/admin/miembros/${fx.athlete_b.id}/suspend`,        token: tokens.A });
    await runCase({ id: 'B4',  desc: 'ADMIN_A reactivates athlete OF GYM B (BOLA)',expected: 404, method: 'POST',  path: `/admin/miembros/${fx.athlete_b.id}/reactivate`,     token: tokens.A });
    await runCase({ id: 'B5',  desc: 'ADMIN_A patches staff OF GYM B (BOLA)',      expected: 404, method: 'PATCH', path: `/admin/staff/${fx.admin_b.id}`,                     token: tokens.A, body: { name: 'hacked' } });
    await runCase({ id: 'B6',  desc: 'ADMIN_A reads payment OF GYM B (BOLA)',      expected: 404, method: 'GET',   path: `/payments/${fx.payment_b_id}`,                       token: tokens.A });
    await runCase({ id: 'B8',  desc: 'ADMIN_A reads measurements of GYM B (BOLA)', expected: 404, method: 'GET',   path: `/admin/measurements/${fx.athlete_b.id}`,            token: tokens.A });
    await runCase({ id: 'B9',  desc: 'Unauthenticated request',                    expected: 401, method: 'GET',   path: `/admin/miembros/${fx.athlete_a.id}` });
    await runCase({ id: 'B11', desc: 'ADMIN_A escalates staff to SUPERADMIN',      expected: 403, method: 'PATCH', path: `/admin/staff/${fx.admin_a.id}`,                     token: tokens.A, body: { role: 'SUPERADMIN' } });
    await runCase({ id: 'B13', desc: 'PATCH with empty body returns NO_CHANGES',   expected: 400, method: 'PATCH', path: `/admin/miembros/${fx.athlete_a.id}`,                token: tokens.A, body: {} });
    await runCase({ id: 'B14', desc: 'ADMIN_A tries to delete SELF (staff)',       expected: 400, method: 'DELETE',path: `/admin/staff/${fx.admin_a.id}`,                     token: tokens.A });
    console.log();

    await header('B7: Listing isolation');
    {
        const res = await fetch(`${API_URL}/admin/payments?limit=500`, {
            headers: { 'Authorization': `Bearer ${tokens.A}` },
        });
        const body = await res.json().catch(() => ({}));
        const list = body.payments || [];
        const leakCount = list.filter(p => p.user_id === fx.athlete_b.id).length;
        if (res.status === 200 && leakCount === 0) {
            console.log(`  [PASS] B7    payments listing excludes workspace B            leak_count=0`);
            pass++;
        } else {
            console.log(`  [FAIL] B7    payments listing LEAKED workspace B users        status=${res.status} leak_count=${leakCount}`);
            fail++;
            failedCases.push(`B7: listing leaked ${leakCount} rows from workspace B (status=${res.status})`);
        }
    }
    console.log();

    await header('B12: Mass-assign role ignored');
    {
        const before = await fetch(`${API_URL}/admin/miembros/${fx.athlete_a.id}`, {
            headers: { 'Authorization': `Bearer ${tokens.A}` },
        }).then(r => r.json()).catch(() => ({}));
        const preRole = before.role;

        await fetch(`${API_URL}/admin/miembros/${fx.athlete_a.id}`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${tokens.A}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 'ADMIN', name: 'BOLA mass-assign attempt' }),
        });

        const after = await fetch(`${API_URL}/admin/miembros/${fx.athlete_a.id}`, {
            headers: { 'Authorization': `Bearer ${tokens.A}` },
        }).then(r => r.json()).catch(() => ({}));
        const postRole = after.role;

        if (preRole === postRole) {
            console.log(`  [PASS] B12   role NOT escalated via PATCH body                role=${postRole}`);
            pass++;
        } else {
            console.log(`  [FAIL] B12   role ESCALATED via PATCH body                    before=${preRole} after=${postRole}`);
            fail++;
            failedCases.push(`B12: role escalated from ${preRole} to ${postRole}`);
        }
    }
    console.log();

    await header('B15–B16: Owner path');
    await runCase({ id: 'B15', desc: 'Athlete reads OWN payment',                 expected: 200, method: 'GET', path: `/payments/${fx.payment_a_id}`, token: tokens.athleteA });
    await runCase({ id: 'B16', desc: 'Athlete reads SOMEONE ELSE\'S payment',     expectedSet: [403, 404], method: 'GET', path: `/payments/${fx.payment_b_id}`, token: tokens.athleteA });
    console.log();

    await header('R1–R6: Smoke regression (non-admin flows)');
    await runCase({ id: 'R1', desc: 'Athlete lists own payments',                 expected: 200, method: 'GET',  path: `/payments/me`,           token: tokens.athleteA });
    await runCase({ id: 'R2', desc: 'Athlete lists own measurements',             expected: 200, method: 'GET',  path: `/measurements/me`,       token: tokens.athleteA });
    await runCase({ id: 'R3', desc: 'Athlete creates self-measurement',           expected: 200, method: 'POST', path: `/measurements`,          token: tokens.athleteA, body: { weight_kg: 80 } });
    await runCase({ id: 'R4', desc: 'Athlete cross-user measurement',             expected: 403, method: 'POST', path: `/measurements`,          token: tokens.athleteA, body: { user_id: fx.athlete_b.id, weight_kg: 80 } });
    await runCase({ id: 'R6', desc: 'ADMIN_A lists OWN staff',                    expected: 200, method: 'GET',  path: `/admin/staff`,           token: tokens.A });
    console.log();

    console.log('═'.repeat(80));
    console.log(`RESULT:  PASS=${pass}  FAIL=${fail}`);
    if (fail > 0) {
        console.log();
        console.log('Failed cases:');
        for (const c of failedCases) console.log(`  • ${c}`);
        process.exit(1);
    }
    console.log('All tests passed ✅');
    process.exit(0);
}

main().catch(e => {
    console.error('FATAL:', e.message);
    process.exit(2);
});
