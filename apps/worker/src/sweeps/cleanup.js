// ─────────────────────────────────────────────────────────────────
// Cleanup sweep — deletes AutomationJob rows with status=DONE
// older than 30 days. Keeps automation_jobs table from ballooning
// over time (we persist a rolling operational log).
//
// FAILED rows are retained so ops can inspect them.
// ─────────────────────────────────────────────────────────────────

import dayjs from 'dayjs';
import { prisma } from '@cedgym/db';

export async function runCleanupSweep() {
    const cutoff = dayjs().subtract(30, 'day').toDate();
    const { count } = await prisma.automationJob.deleteMany({
        where: {
            status: 'DONE',
            updated_at: { lt: cutoff },
        },
    });
    return { deleted: count };
}

export default { runCleanupSweep };
