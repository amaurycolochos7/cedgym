// ═══════════════════════════════════════════════════════════════
// CED-GYM — bootstrap seed.
// Idempotent: safe to run repeatedly. Creates:
//   - Workspace { slug: 'ced-gym' } (if missing).
//   - SUPERADMIN user admin@cedgym.mx.
//   - WhatsAppSession placeholder for that workspace.
// Run: `node src/seed.js` (or via package.json `pnpm seed`).
// ═══════════════════════════════════════════════════════════════
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from '@cedgym/db';

const DEFAULT_SLUG = 'ced-gym';
const DEFAULT_NAME = 'CED-GYM';
const SUPERADMIN_EMAIL = 'admin@cedgym.mx';

// Require SEED_ADMIN_PASSWORD explicitly — never fall back to a hardcoded
// value. Anyone with the repo would otherwise know the SUPERADMIN password.
// Generate one with: openssl rand -base64 24
const SUPERADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;
if (!SUPERADMIN_PASSWORD || SUPERADMIN_PASSWORD.length < 12) {
    console.error(
        '[seed] SEED_ADMIN_PASSWORD env var is required (min 12 chars).\n' +
        '       Generate one: openssl rand -base64 24\n' +
        '       Then: SEED_ADMIN_PASSWORD=<value> node apps/api/src/seed.js'
    );
    process.exit(1);
}

// Base gamification badges (Fase 8). Seeded here so fresh dev
// envs can award badges the moment a member hits the thresholds.
// Icons are left as placeholder paths — the web app maps them.
const BADGES = [
    { code: 'FIRST_CHECKIN',  name: 'Primer paso',      description: 'Tu primer check-in en el gym.',           icon_url: '/badges/first_checkin.svg',  xp_reward: 25,  rarity: 'COMMON'    },
    { code: 'STREAK_7',       name: 'Semana completa',   description: '7 días consecutivos entrenando.',        icon_url: '/badges/streak_7.svg',       xp_reward: 50,  rarity: 'RARE'      },
    { code: 'STREAK_30',      name: 'Mes de fuego',      description: '30 días consecutivos. Imparable.',       icon_url: '/badges/streak_30.svg',      xp_reward: 200, rarity: 'EPIC'      },
    { code: 'STREAK_90',      name: 'Dedicación total',  description: '90 días consecutivos. Leyenda.',         icon_url: '/badges/streak_90.svg',      xp_reward: 500, rarity: 'LEGENDARY' },
    { code: 'CHECKIN_100',    name: 'Centurión',         description: '100 check-ins acumulados.',              icon_url: '/badges/checkin_100.svg',    xp_reward: 300, rarity: 'EPIC'      },
    { code: 'LEVEL_10',       name: 'Iniciado',          description: 'Alcanzaste el nivel 10.',                icon_url: '/badges/level_10.svg',       xp_reward: 0,   rarity: 'COMMON'    },
    { code: 'LEVEL_25',       name: 'Avanzado',          description: 'Alcanzaste el nivel 25.',                icon_url: '/badges/level_25.svg',       xp_reward: 0,   rarity: 'RARE'      },
    { code: 'FIRST_PURCHASE', name: 'Primera rutina',    description: 'Compraste tu primera rutina digital.',  icon_url: '/badges/first_purchase.svg', xp_reward: 50,  rarity: 'COMMON'    },
];

async function main() {
    console.log('[seed] starting…');

    // ── Workspace ──
    let workspace = await prisma.workspace.findUnique({ where: { slug: DEFAULT_SLUG } });
    if (!workspace) {
        workspace = await prisma.workspace.create({
            data: {
                slug: DEFAULT_SLUG,
                name: DEFAULT_NAME,
                plan: 'PRO',
            },
        });
        console.log(`[seed] workspace created: ${workspace.id}`);
    } else {
        console.log(`[seed] workspace already exists: ${workspace.id}`);
    }

    // ── Superadmin ──
    const existingAdmin = await prisma.user.findUnique({ where: { email: SUPERADMIN_EMAIL } });
    if (!existingAdmin) {
        const password_hash = await bcrypt.hash(SUPERADMIN_PASSWORD, 12);
        const admin = await prisma.user.create({
            data: {
                workspace_id: workspace.id,
                name: 'Super Admin',
                full_name: 'Super Admin',
                email: SUPERADMIN_EMAIL,
                // Phone is optional for SUPERADMIN — stays null until someone
                // binds a real number via the admin UI.
                role: 'SUPERADMIN',
                password_hash,
                status: 'ACTIVE',
                email_verified_at: new Date(),
                profile_completed: true,
            },
        });
        console.log(`[seed] superadmin created: ${admin.email}`);
    } else {
        console.log(`[seed] superadmin already exists: ${existingAdmin.email}`);
    }

    // ── WhatsApp session placeholder ──
    // `@@unique([workspace_id])` on WhatsAppSession means we can upsert by
    // that key. This row is what the bot populates when the admin scans
    // the QR — pre-creating it keeps the UI from showing "not initialized".
    await prisma.whatsAppSession.upsert({
        where: { workspace_id: workspace.id },
        update: {},
        create: {
            workspace_id: workspace.id,
            is_connected: false,
            initializing: false,
        },
    });
    console.log('[seed] whatsapp session placeholder ready');

    // ── Badges ──
    // Upsert by unique `code` so re-running the seed never duplicates.
    for (const b of BADGES) {
        await prisma.badge.upsert({
            where: { code: b.code },
            update: {
                name: b.name,
                description: b.description,
                icon_url: b.icon_url,
                xp_reward: b.xp_reward,
                rarity: b.rarity,
            },
            create: b,
        });
    }
    console.log(`[seed] ${BADGES.length} base badges ready`);

    console.log('[seed] done.');
}

main()
    .catch((e) => {
        console.error('[seed] FAILED:', e);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
