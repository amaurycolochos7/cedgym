// ─────────────────────────────────────────────────────────────────
// Membership sweeps:
//   • Expiring in 8 / 3 / 1 days  → fire 'membership.expiring_soon'
//   • Expired yesterday            → fire 'membership.expired'
//
// Both are guarded by Redis idempotency keys so the sweep can run
// every few minutes without generating duplicate jobs.
// ─────────────────────────────────────────────────────────────────

import dayjs from 'dayjs';
import { prisma } from '@cedgym/db';
import { fireEventInWorker } from './fire-event.js';

const EXPIRY_THRESHOLDS = [8, 3, 1];

/**
 * For each threshold, find memberships whose expires_at falls
 * inside the [now+days, now+days+1) day window — this gives us a
 * ~24h band per threshold, so running the sweep every 5 min just
 * re-hits the same set (Redis idempotency stops re-fires).
 */
export async function runExpiringSweep(redis) {
    let fired = 0;

    for (const days of EXPIRY_THRESHOLDS) {
        const from = dayjs().add(days, 'day').startOf('day').toDate();
        const to   = dayjs().add(days, 'day').endOf('day').toDate();

        const expiring = await prisma.membership.findMany({
            where: {
                status: 'ACTIVE',
                expires_at: { gte: from, lte: to },
            },
            select: {
                id: true,
                user_id: true,
                workspace_id: true,
                plan: true,
                expires_at: true,
            },
        });

        for (const m of expiring) {
            const idempKey = `notif:expiry:${m.id}:d${days}`;
            const exists = await redis.exists(idempKey);
            if (exists) continue;

            await fireEventInWorker('membership.expiring_soon', {
                workspaceId: m.workspace_id,
                user_id: m.user_id,
                membership_id: m.id,
                days_before: days,
                plan: m.plan,
                expires_at: m.expires_at,
            });

            // 24h TTL so the next day we can fire for the next bucket.
            await redis.set(idempKey, '1', 'EX', 24 * 60 * 60);
            fired += 1;
        }
    }

    return { fired };
}

/**
 * Memberships that expired in the last 24h (state still ACTIVE or
 * already flipped to EXPIRED). We fire once per membership/day.
 */
export async function runExpiredSweep(redis) {
    const from = dayjs().subtract(1, 'day').startOf('day').toDate();
    const to   = dayjs().subtract(1, 'day').endOf('day').toDate();

    const rows = await prisma.membership.findMany({
        where: {
            expires_at: { gte: from, lte: to },
            status: { in: ['ACTIVE', 'EXPIRED'] },
        },
        select: {
            id: true,
            user_id: true,
            workspace_id: true,
            plan: true,
            expires_at: true,
        },
    });

    let fired = 0;
    for (const m of rows) {
        const idempKey = `notif:expired:${m.id}`;
        const exists = await redis.exists(idempKey);
        if (exists) continue;

        await fireEventInWorker('membership.expired', {
            workspaceId: m.workspace_id,
            user_id: m.user_id,
            membership_id: m.id,
            plan: m.plan,
            expires_at: m.expires_at,
        });

        // Long TTL — we never want to re-fire "expired" more than once.
        await redis.set(idempKey, '1', 'EX', 30 * 24 * 60 * 60);
        fired += 1;
    }

    return { fired };
}

export default { runExpiringSweep, runExpiredSweep };
