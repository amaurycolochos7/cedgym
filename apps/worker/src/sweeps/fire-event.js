// ─────────────────────────────────────────────────────────────────
// Worker-side fireEvent — mirrors apps/api/src/lib/events.js.
// Queues AutomationJob rows directly in Postgres (no HTTP hop to
// the API). Safe to be called from sweeps.
// ─────────────────────────────────────────────────────────────────

import { prisma } from '@cedgym/db';

function matchesFilter(filter, context) {
    if (!filter || typeof filter !== 'object') return true;
    for (const [key, value] of Object.entries(filter)) {
        if (context[key] !== value) return false;
    }
    return true;
}

export async function fireEventInWorker(trigger, contextFromCaller) {
    try {
        const { workspaceId, ...context } = contextFromCaller || {};
        if (!workspaceId) {
            console.warn(`[worker/fireEvent] ${trigger} without workspaceId — skipping`);
            return { queued: 0 };
        }

        const automations = await prisma.automation.findMany({
            where: { workspace_id: workspaceId, trigger, enabled: true },
        });
        if (!automations.length) return { queued: 0 };

        const now = Date.now();
        let queued = 0;
        for (const auto of automations) {
            if (!matchesFilter(auto.filter || {}, context)) continue;
            const delayMs = (auto.delay_minutes || 0) * 60 * 1000;
            await prisma.automationJob.create({
                data: {
                    workspace_id: workspaceId,
                    automation_id: auto.id,
                    trigger_event: trigger,
                    context,
                    scheduled_at: new Date(now + delayMs),
                },
            });
            queued += 1;
        }
        return { queued };
    } catch (e) {
        console.error(`[worker/fireEvent] ${trigger} failed:`, e.message);
        return { queued: 0, error: e.message };
    }
}

export default fireEventInWorker;
