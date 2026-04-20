// ─────────────────────────────────────────────────────────────────
// Upsell sweep — users registered ≥ UPSELL_DELAY_HOURS ago with no
// membership ever → send a friendly "elige tu plan" nudge on WhatsApp.
//
// Guarded by Redis idempotency (per-user, 30-day window) so we never
// spam: at most one upsell ping per user within 30 days.
// ─────────────────────────────────────────────────────────────────

import dayjs from 'dayjs';
import { prisma } from '@cedgym/db';

const UPSELL_DELAY_HOURS = Number(process.env.UPSELL_DELAY_HOURS || 48);
const DEDUPE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

async function sendWa({ workspaceId, phone, message, logger }) {
    const url = process.env.WHATSAPP_BOT_URL;
    const key = process.env.WHATSAPP_BOT_KEY;
    if (!url || !key || !phone) return { ok: false, error: 'not_configured' };
    try {
        const res = await fetch(`${url}/send-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': key },
            body: JSON.stringify({ workspaceId, phone, message }),
        });
        if (!res.ok) return { ok: false, error: `status_${res.status}` };
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

function renderUpsell({ name, appUrl }) {
    const portal = appUrl || process.env.API_PUBLIC_URL?.replace('api.', 'cedgym.') || 'https://cedgym.187-77-11-79.sslip.io';
    const firstName = (name || '').split(' ')[0] || 'amig@';
    return [
        `Hola ${firstName} 👋`,
        ``,
        `Vimos que tu cuenta en *CED·GYM* todavía no tiene plan activo.`,
        `Arranca hoy y marca la diferencia 💪`,
        ``,
        `👉 ${portal}/planes`,
        ``,
        `📣 *Bonus*: usa el código *PRIMERA10* y obtén 10% de descuento en tu primer mes.`,
        ``,
        `Cualquier duda, responde este chat.`,
    ].join('\n');
}

export async function runUpsellSweep(redis) {
    const cutoff = dayjs().subtract(UPSELL_DELAY_HOURS, 'hour').toDate();

    // Users registered ≥cutoff, no membership record (ever), role=ATHLETE.
    const candidates = await prisma.user.findMany({
        where: {
            role: 'ATHLETE',
            status: 'ACTIVE',
            created_at: { lte: cutoff },
            phone: { not: null },
            phone_verified_at: { not: null },
            membership: null,
        },
        select: {
            id: true,
            workspace_id: true,
            phone: true,
            full_name: true,
            name: true,
        },
        take: 100, // safety cap per sweep
    });

    let fired = 0;
    let skipped = 0;
    let failed = 0;

    for (const u of candidates) {
        const key = `upsell:noplan:${u.id}`;
        // Redis NX lock → only send once per 30-day window.
        const lockOk = await redis.set(key, dayjs().toISOString(), 'EX', DEDUPE_TTL_SECONDS, 'NX');
        if (!lockOk) {
            skipped++;
            continue;
        }

        const res = await sendWa({
            workspaceId: u.workspace_id,
            phone: u.phone,
            message: renderUpsell({ name: u.full_name || u.name }),
        });

        if (res.ok) {
            fired++;
        } else {
            failed++;
            // Release the lock so next sweep retries.
            await redis.del(key);
        }
    }

    return { candidates: candidates.length, fired, skipped, failed };
}
