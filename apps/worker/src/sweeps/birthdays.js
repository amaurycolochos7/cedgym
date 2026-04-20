// ─────────────────────────────────────────────────────────────────
// Birthday sweep — fires `member.birthday` for any active member
// whose birth_date month+day matches today.
//
// Idempotency: one fire per user per calendar year.
// ─────────────────────────────────────────────────────────────────

import dayjs from 'dayjs';
import { prisma } from '@cedgym/db';
import { fireEventInWorker } from './fire-event.js';

export async function runBirthdaySweep(redis) {
    const now = dayjs();
    const month = now.month() + 1;   // 1..12
    const day = now.date();           // 1..31
    const year = now.year();

    // EXTRACT lets us match MM-DD directly in Postgres without loading
    // every user. Active-status filter keeps us from nagging SUSPENDED
    // accounts.
    const rows = await prisma.$queryRaw`
        SELECT
          id            AS user_id,
          workspace_id,
          name,
          phone
        FROM users
        WHERE status = 'ACTIVE'
          AND birth_date IS NOT NULL
          AND EXTRACT(MONTH FROM birth_date) = ${month}
          AND EXTRACT(DAY   FROM birth_date) = ${day}
    `;

    let fired = 0;
    for (const row of rows) {
        const idempKey = `notif:birthday:${row.user_id}:${year}`;
        const exists = await redis.exists(idempKey);
        if (exists) continue;

        await fireEventInWorker('member.birthday', {
            workspaceId: row.workspace_id,
            user_id: row.user_id,
        });

        // TTL 366 days → fires once per year.
        await redis.set(idempKey, '1', 'EX', 366 * 24 * 60 * 60);
        fired += 1;
    }

    return { fired, candidates: rows.length };
}

export default { runBirthdaySweep };
