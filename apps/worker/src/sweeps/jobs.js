// ─────────────────────────────────────────────────────────────────
// AutomationJob sweep — pulls PENDING rows, executes the associated
// automation action, and transitions status. Retry policy:
//
//   attempt 1 → delay 1 min
//   attempt 2 → delay 5 min
//   attempt 3 → delay 15 min
//   attempt >=3 on next failure → FAILED
//
// Actions supported:
//   - whatsapp.send_template → renders MessageTemplate + POSTs to bot
//   - push.notify            → stub (logs, returns ok)
//   - email.send             → stub (logs, returns ok)
// ─────────────────────────────────────────────────────────────────

import { prisma } from '@cedgym/db';
import { renderTemplate } from '../lib/template-renderer.js';

const BOT_URL = process.env.WHATSAPP_BOT_URL || 'http://whatsapp-bot:3002';
const BOT_KEY = process.env.WHATSAPP_BOT_KEY || '';

// Backoff table keyed by the attempt number AFTER incrementing.
// attempt=1 → wait 1min, attempt=2 → 5min, attempt=3 → 15min.
const BACKOFF_MIN = { 1: 1, 2: 5, 3: 15 };

async function loadAutomation(automationId) {
    return prisma.automation.findUnique({ where: { id: automationId } });
}

// Resolves the destination phone for a WhatsApp send. Order of
// precedence:
//   1. params.to === 'member' → user.phone (from context.user_id)
//   2. params.phone           → explicit override
//   3. context.phone          → event-provided phone (OTP flow)
async function resolveDestinationPhone(params, context) {
    if (params?.phone) return params.phone;
    if (context?.phone) return context.phone;
    const target = params?.to || 'member';
    if (target === 'member' && context.user_id) {
        const user = await prisma.user.findUnique({
            where: { id: context.user_id },
            select: { phone: true },
        });
        return user?.phone || null;
    }
    return null;
}

async function sendWhatsApp({ workspaceId, phone, message }) {
    if (!phone) return { ok: false, error: 'NO_PHONE' };
    if (!message) return { ok: false, error: 'EMPTY_MESSAGE' };

    try {
        const res = await fetch(`${BOT_URL}/send-message`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': BOT_KEY,
            },
            body: JSON.stringify({ workspaceId, phone, message }),
        });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            return { ok: false, error: `BOT_${res.status}`, body: body.slice(0, 200) };
        }
        const data = await res.json().catch(() => ({}));
        return { ok: true, bot: data };
    } catch (e) {
        return { ok: false, error: 'FETCH_FAILED', detail: e.message };
    }
}

async function executeJob(job) {
    const automation = await loadAutomation(job.automation_id);
    if (!automation) {
        return { ok: false, error: 'AUTOMATION_DELETED' };
    }
    if (!automation.enabled) {
        return { ok: true, skipped: 'disabled' };
    }

    const context = { ...(job.context || {}), workspace_id: automation.workspace_id };
    const action = automation.action;
    const params = automation.params || {};

    if (action === 'whatsapp.send_template') {
        const templateId = params.template_id;
        if (!templateId) return { ok: false, error: 'NO_TEMPLATE_ID' };

        const template = await prisma.messageTemplate.findUnique({ where: { id: templateId } });
        if (!template) return { ok: false, error: 'TEMPLATE_NOT_FOUND' };

        const message = await renderTemplate(template.body, context);
        const phone = await resolveDestinationPhone(params, context);
        const result = await sendWhatsApp({
            workspaceId: automation.workspace_id,
            phone,
            message,
        });
        return {
            ok: result.ok,
            channel: 'whatsapp',
            template_code: template.code,
            phone,
            send_result: result,
        };
    }

    if (action === 'push.notify') {
        console.log(`[worker] push.notify STUB — context=${JSON.stringify(context).slice(0, 200)}`);
        return { ok: true, channel: 'push', stub: true };
    }

    if (action === 'email.send') {
        console.log(`[worker] email.send STUB — context=${JSON.stringify(context).slice(0, 200)}`);
        return { ok: true, channel: 'email', stub: true };
    }

    return { ok: false, error: `UNKNOWN_ACTION:${action}` };
}

/**
 * Run one pass of the sweep. Returns counts — caller handles logging.
 */
export async function runJobSweep() {
    const pending = await prisma.automationJob.findMany({
        where: { status: 'PENDING', scheduled_at: { lte: new Date() } },
        orderBy: { scheduled_at: 'asc' },
        take: 50,
    });
    if (pending.length === 0) return { processed: 0, done: 0, failed: 0, retried: 0 };

    let done = 0, failed = 0, retried = 0;

    for (const job of pending) {
        // Claim the job (best-effort — if two workers race, one will lose the update count).
        const claim = await prisma.automationJob.updateMany({
            where: { id: job.id, status: 'PENDING' },
            data: { status: 'RUNNING' },
        });
        if (claim.count === 0) continue;

        try {
            const result = await executeJob(job);
            if (result.ok) {
                await prisma.automationJob.update({
                    where: { id: job.id },
                    data: {
                        status: 'DONE',
                        result_data: result,
                        last_error: null,
                    },
                });
                done += 1;
            } else {
                throw new Error(result.error || 'execution failed: ' + JSON.stringify(result));
            }
        } catch (error) {
            const nextAttempts = (job.attempts || 0) + 1;
            if (nextAttempts >= 3) {
                await prisma.automationJob.update({
                    where: { id: job.id },
                    data: {
                        status: 'FAILED',
                        attempts: nextAttempts,
                        last_error: String(error.message || error).slice(0, 2000),
                    },
                });
                failed += 1;
            } else {
                const waitMin = BACKOFF_MIN[nextAttempts] || 15;
                await prisma.automationJob.update({
                    where: { id: job.id },
                    data: {
                        status: 'PENDING',
                        attempts: nextAttempts,
                        last_error: String(error.message || error).slice(0, 2000),
                        scheduled_at: new Date(Date.now() + waitMin * 60 * 1000),
                    },
                });
                retried += 1;
            }
        }
    }

    return { processed: pending.length, done, failed, retried };
}

export default { runJobSweep };
