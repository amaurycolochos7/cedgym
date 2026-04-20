// ─────────────────────────────────────────────────────────────
// Welcome drip — schedules the post-OTP welcome WhatsApp at T+2min.
//
// Why delayed?
//   The user just finished the OTP-verify flow and is likely still
//   looking at our web app ("signup → portal"). Receiving a WhatsApp
//   message instantly feels automated; a short delay reads as warmer
//   onboarding and coincides with the moment the user usually pulls
//   their phone out.
//
// Why AutomationJob (not setTimeout)?
//   Restart safety. If the API process restarts between verify and
//   T+2min, a setTimeout would be lost. The AutomationJob row lives
//   in Postgres and the worker's `runJobSweep` picks it up after
//   `scheduled_at`.
//
// Architecture:
//   We re-use the existing Automation + AutomationJob schema instead
//   of inventing a new `delayed_messages` table. Each workspace gets
//   a single system-owned Automation row (system.welcome_drip) that
//   the jobs worker knows how to execute via the `whatsapp.send_raw`
//   action — it reads context.message + context.phone and fires.
//
//   The system automation is upserted on first use; there's no need
//   to run an extra seed step.
// ─────────────────────────────────────────────────────────────

import { prisma } from '@cedgym/db';
import { renderWelcomeMessage } from './whatsapp.js';

const SYSTEM_AUTOMATION_NAME = 'system.welcome_drip';
const SYSTEM_TRIGGER = 'auth.register.verified';
const DELAY_MS = 2 * 60 * 1000;

// Per-workspace upsert — cached in-memory so the second call in the
// same process is just a map lookup. Cache is per-boot; a restart
// re-probes the DB, which is fine (idempotent upsert).
const automationCache = new Map();

async function ensureSystemAutomation(workspaceId) {
    const cached = automationCache.get(workspaceId);
    if (cached) return cached;

    const existing = await prisma.automation.findFirst({
        where: {
            workspace_id: workspaceId,
            name: SYSTEM_AUTOMATION_NAME,
            trigger: SYSTEM_TRIGGER,
        },
    });
    if (existing) {
        automationCache.set(workspaceId, existing.id);
        return existing.id;
    }

    const created = await prisma.automation.create({
        data: {
            workspace_id: workspaceId,
            name: SYSTEM_AUTOMATION_NAME,
            trigger: SYSTEM_TRIGGER,
            filter: null,
            delay_minutes: 2,
            action: 'whatsapp.send_raw',
            params: { to: 'member' },
            enabled: true,
        },
    });
    automationCache.set(workspaceId, created.id);
    return created.id;
}

/**
 * Enqueue a T+2min welcome WhatsApp for a newly-verified user.
 * Fire-and-forget friendly: on failure we log via the provided logger
 * and swallow — the registration flow must NEVER fail because the drip
 * couldn't be queued.
 *
 * Returns `{ ok, jobId?, error? }`.
 */
export async function scheduleWelcomeDrip({ user, logger }) {
    try {
        if (!user?.workspace_id || !user?.phone) {
            return { ok: false, error: 'missing_user_fields' };
        }

        const automationId = await ensureSystemAutomation(user.workspace_id);

        // Render message NOW with current user data — that way restart
        // or edits to renderWelcomeMessage after the fact don't surprise
        // us with a different copy.
        const message = renderWelcomeMessage({
            name: user.full_name || user.name,
        });

        const job = await prisma.automationJob.create({
            data: {
                workspace_id: user.workspace_id,
                automation_id: automationId,
                trigger_event: SYSTEM_TRIGGER,
                context: {
                    user_id: user.id,
                    phone: user.phone,
                    message,
                },
                scheduled_at: new Date(Date.now() + DELAY_MS),
            },
        });
        return { ok: true, jobId: job.id };
    } catch (error) {
        logger?.warn?.({ err: error.message }, '[welcome-drip] enqueue failed');
        return { ok: false, error: error.message };
    }
}

export default scheduleWelcomeDrip;
