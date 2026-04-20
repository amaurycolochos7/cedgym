// ─────────────────────────────────────────────────────────────────
// Inactivity sweep — users who haven't checked in for >=14 days.
//
// Idempotency: one fire per user per calendar month. Keeps the
// notification from nagging daily once someone goes dormant.
// ─────────────────────────────────────────────────────────────────

import dayjs from 'dayjs';
import { prisma } from '@cedgym/db';
import { fireEventInWorker } from './fire-event.js';

export async function runInactivitySweep(redis) {
    const cutoff = dayjs().subtract(14, 'day').toDate();

    // Candidate set: ACTIVE members whose most recent check_in is
    // older than 14 days (or who have no check_ins at all). We do
    // this in SQL so we don't ship 10k users over the wire.
    const rows = await prisma.$queryRaw`
        SELECT
          u.id           AS user_id,
          u.workspace_id AS workspace_id,
          MAX(c.scanned_at) AS last_checkin
        FROM users u
        JOIN memberships m ON m.user_id = u.id
        LEFT JOIN check_ins c ON c.user_id = u.id
        WHERE m.status = 'ACTIVE'
          AND u.status = 'ACTIVE'
        GROUP BY u.id, u.workspace_id
        HAVING MAX(c.scanned_at) IS NULL
            OR MAX(c.scanned_at) < ${cutoff}
    `;

    const monthTag = dayjs().format('YYYY-MM');
    let fired = 0;

    for (const row of rows) {
        const idempKey = `notif:inactivity:${row.user_id}:${monthTag}`;
        const exists = await redis.exists(idempKey);
        if (exists) continue;

        await fireEventInWorker('inactivity.14_days', {
            workspaceId: row.workspace_id,
            user_id: row.user_id,
            last_checkin: row.last_checkin,
        });

        // TTL 31 days — fires max once per calendar month.
        await redis.set(idempKey, '1', 'EX', 31 * 24 * 60 * 60);
        fired += 1;
    }

    return { fired, candidates: rows.length };
}

export default { runInactivitySweep };
