// ─────────────────────────────────────────────────────────────────
// Event bus → hydrates AutomationJob rows for a given trigger.
//
// Call from route handlers with:
//   await fireEvent('payment.approved', { workspaceId, paymentId, userId })
//
// Intentionally fire-and-forget: if automations crash we log and
// swallow — a broken automation MUST NOT block a business operation
// (payment processing, membership activation, etc.).
//
// Adapted from motopartes-manager/apps/api/src/lib/events.js.
// ─────────────────────────────────────────────────────────────────

import { prisma } from '@cedgym/db';

// Filter matcher — automations can define { filter: { plan: 'PRO' } }
// and we only queue the job if the event context matches all keys.
function matchesFilter(filter, context) {
    if (!filter || typeof filter !== 'object') return true;
    for (const [key, value] of Object.entries(filter)) {
        if (context[key] !== value) return false;
    }
    return true;
}

export async function fireEvent(trigger, contextFromCaller) {
    try {
        const { workspaceId, ...context } = contextFromCaller || {};
        if (!workspaceId) {
            console.warn(`[events] ${trigger} fired without workspaceId — skipping`);
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
    } catch (error) {
        console.error(`[events] fireEvent(${trigger}) failed:`, error.message);
        return { queued: 0, error: error.message };
    }
}

export default fireEvent;
