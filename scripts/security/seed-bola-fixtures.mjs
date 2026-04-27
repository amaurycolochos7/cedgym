// ─────────────────────────────────────────────────────────────
// E2E fixtures for the BOLA / cross-tenant test suite.
//
// Seeds a SECOND workspace (gym-test-b) plus minimal fixtures
// (admin, athlete, payment, measurement) that the test runner
// uses to attempt cross-tenant attacks. Workspace A (ced-gym)
// is assumed to already exist with `apps/api/src/seed.js`.
//
// Idempotent: every record uses a deterministic email/slug so
// re-running upserts instead of duplicating.
//
// Usage:
//   DATABASE_URL=postgresql://... node scripts/security/seed-bola-fixtures.mjs
//
// Prints a JSON object to stdout with all the IDs the test
// runner needs. Pipe to a file:
//   node scripts/security/seed-bola-fixtures.mjs > scripts/security/.bola-fixtures.json
//
// Cleanup:
//   node scripts/security/seed-bola-fixtures.mjs --cleanup
//   (removes everything tagged with the e2e marker)
// ─────────────────────────────────────────────────────────────
// Import via relative path so Node ESM resolves @prisma/client from
// packages/db/node_modules without needing pnpm workspace symlinks.
import { prisma } from '../../packages/db/src/index.js';
import bcrypt from '../../apps/api/node_modules/bcryptjs/index.js';

// Stable markers — easy to grep + delete.
const E2E_MARKER = 'e2e-bola';
const WS_A_SLUG = 'ced-gym';                // existing primary workspace
const WS_B_SLUG = 'gym-test-bola';
const ADMIN_A_EMAIL = 'admin@cedgym.mx';    // from apps/api/src/seed.js
const ADMIN_B_EMAIL = `admin-${E2E_MARKER}@e2e.local`;
const ATHLETE_A_EMAIL = `atleta-a-${E2E_MARKER}@e2e.local`;
const ATHLETE_B_EMAIL = `atleta-b-${E2E_MARKER}@e2e.local`;
const ADMIN_B_PASSWORD = 'TestBolaB2026!';
const ATHLETE_PASSWORD = 'TestAthlete2026!';

async function cleanup() {
    process.stderr.write('[seed] cleanup mode — removing e2e fixtures\n');
    // Delete order respects FKs.
    await prisma.bodyMeasurement.deleteMany({
        where: { user: { email: { contains: E2E_MARKER } } },
    }).catch(() => {});
    await prisma.payment.deleteMany({
        where: { user: { email: { contains: E2E_MARKER } } },
    }).catch(() => {});
    await prisma.refreshToken.deleteMany({
        where: { user: { email: { contains: E2E_MARKER } } },
    }).catch(() => {});
    await prisma.user.deleteMany({
        where: { email: { contains: E2E_MARKER } },
    });
    await prisma.workspace.deleteMany({
        where: { slug: WS_B_SLUG },
    });
    process.stderr.write('[seed] cleanup done\n');
}

async function ensureWorkspaceB() {
    const existing = await prisma.workspace.findUnique({ where: { slug: WS_B_SLUG } });
    if (existing) return existing;
    return prisma.workspace.create({
        data: {
            slug: WS_B_SLUG,
            name: 'Gym Test B (BOLA fixtures)',
            plan: 'PRO',
        },
    });
}

async function upsertUser({ email, phone, name, role, workspaceId, password }) {
    const password_hash = await bcrypt.hash(password, 10);
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        // Refresh role/workspace/password so re-runs don't drift.
        return prisma.user.update({
            where: { id: existing.id },
            data: { role, workspace_id: workspaceId, password_hash },
        });
    }
    return prisma.user.create({
        data: {
            email,
            phone,
            name,
            full_name: name,
            role,
            status: 'ACTIVE',
            phone_verified_at: new Date(),
            email_verified_at: new Date(),
            profile_completed: true,
            password_hash,
            workspace_id: workspaceId,
        },
    });
}

async function ensurePayment({ workspaceId, userId, marker }) {
    const existing = await prisma.payment.findFirst({
        where: { workspace_id: workspaceId, reference: marker },
    });
    if (existing) return existing;
    return prisma.payment.create({
        data: {
            workspace_id: workspaceId,
            user_id: userId,
            type: 'MEMBERSHIP',
            amount: 999,
            status: 'APPROVED',
            reference: marker,
            description: 'BOLA fixture payment',
            paid_at: new Date(),
            metadata: { e2e: true, marker: E2E_MARKER },
        },
    });
}

async function ensureMeasurement({ userId }) {
    const existing = await prisma.bodyMeasurement.findFirst({
        where: { user_id: userId, notes: `marker:${E2E_MARKER}` },
    });
    if (existing) return existing;
    return prisma.bodyMeasurement.create({
        data: {
            user_id: userId,
            weight_kg: 75,
            body_fat_pct: 18,
            notes: `marker:${E2E_MARKER}`,
        },
    });
}

async function main() {
    if (process.argv.includes('--cleanup')) {
        await cleanup();
        await prisma.$disconnect();
        return;
    }

    const wsA = await prisma.workspace.findUnique({ where: { slug: WS_A_SLUG } });
    if (!wsA) {
        process.stderr.write(`[seed] ERROR: workspace '${WS_A_SLUG}' missing. Run apps/api/src/seed.js first.\n`);
        process.exit(1);
    }
    const adminA = await prisma.user.findUnique({ where: { email: ADMIN_A_EMAIL } });
    if (!adminA) {
        process.stderr.write(`[seed] ERROR: admin '${ADMIN_A_EMAIL}' missing. Run apps/api/src/seed.js first.\n`);
        process.exit(1);
    }

    const wsB = await ensureWorkspaceB();

    const adminB = await upsertUser({
        email: ADMIN_B_EMAIL,
        phone: `+520000${E2E_MARKER.length}001`,
        name: 'Admin B',
        role: 'ADMIN',
        workspaceId: wsB.id,
        password: ADMIN_B_PASSWORD,
    });

    const athleteA = await upsertUser({
        email: ATHLETE_A_EMAIL,
        phone: `+520000${E2E_MARKER.length}002`,
        name: 'Atleta A (e2e)',
        role: 'ATHLETE',
        workspaceId: wsA.id,
        password: ATHLETE_PASSWORD,
    });

    const athleteB = await upsertUser({
        email: ATHLETE_B_EMAIL,
        phone: `+520000${E2E_MARKER.length}003`,
        name: 'Atleta B (e2e)',
        role: 'ATHLETE',
        workspaceId: wsB.id,
        password: ATHLETE_PASSWORD,
    });

    const paymentB = await ensurePayment({
        workspaceId: wsB.id,
        userId: athleteB.id,
        marker: `BOLA:PAYMENT:B:${E2E_MARKER}`,
    });

    const paymentA = await ensurePayment({
        workspaceId: wsA.id,
        userId: athleteA.id,
        marker: `BOLA:PAYMENT:A:${E2E_MARKER}`,
    });

    const measurementB = await ensureMeasurement({ userId: athleteB.id });

    // Output JSON for the test runner.
    const fixtures = {
        api_url: process.env.API_URL || 'http://localhost:3001',
        workspace_a: { id: wsA.id, slug: wsA.slug },
        workspace_b: { id: wsB.id, slug: wsB.slug },
        admin_a: { id: adminA.id, email: ADMIN_A_EMAIL, password: process.env.ADMIN_A_PASSWORD || 'CedGym2026!' },
        admin_b: { id: adminB.id, email: ADMIN_B_EMAIL, password: ADMIN_B_PASSWORD },
        athlete_a: { id: athleteA.id, email: ATHLETE_A_EMAIL, password: ATHLETE_PASSWORD },
        athlete_b: { id: athleteB.id, email: ATHLETE_B_EMAIL, password: ATHLETE_PASSWORD },
        payment_a_id: paymentA.id,
        payment_b_id: paymentB.id,
        measurement_b_id: measurementB.id,
        e2e_marker: E2E_MARKER,
    };
    process.stdout.write(JSON.stringify(fixtures, null, 2) + '\n');
    process.stderr.write('[seed] fixtures ready\n');
}

main()
    .catch((e) => {
        process.stderr.write(`[seed] error: ${e.message}\n${e.stack}\n`);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
