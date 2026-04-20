// ═══════════════════════════════════════════════════════════════
// CED-GYM — Canonical WhatsApp sender (fire-and-forget friendly).
// ═══════════════════════════════════════════════════════════════

/**
 * Send a plain WhatsApp message through the local bot.
 *
 * Fails silently (returns { ok:false, error }) so callers can safely
 * await without wrapping in try/catch. Never throws.
 */
export async function sendWhatsAppMessage({ workspaceId, phone, message, logger }) {
    const url = process.env.WHATSAPP_BOT_URL;
    const key = process.env.WHATSAPP_BOT_KEY;
    if (!url || !key) {
        logger?.warn?.('[wa] WHATSAPP_BOT_URL or WHATSAPP_BOT_KEY missing — NOT sent');
        return { ok: false, error: 'bot_not_configured' };
    }
    if (!phone) return { ok: false, error: 'no_phone' };

    try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 10_000);
        const res = await fetch(`${url}/send-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': key },
            body: JSON.stringify({ workspaceId, phone, message }),
            signal: controller.signal,
        });
        clearTimeout(t);
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            logger?.warn?.({ status: res.status, body }, '[wa] send failed');
            return { ok: false, error: `status_${res.status}` };
        }
        return { ok: true };
    } catch (err) {
        logger?.warn?.({ err: err.message }, '[wa] send threw');
        return { ok: false, error: err.message };
    }
}

/**
 * Welcome message for a newly-registered user (phone just verified).
 * Nudges them toward buying a plan. Dev note: keep it short — WhatsApp
 * truncates long text and readers skim.
 */
export function renderWelcomeMessage({ name, gymName = 'CED·GYM', appUrl }) {
    const portal = appUrl || process.env.API_PUBLIC_URL?.replace('api.', 'cedgym.') || 'https://cedgym.187-77-11-79.sslip.io';
    const firstName = (name || '').split(' ')[0] || '¡Bienvenid@!';
    return [
        `💪 ¡Hola ${firstName}! Bienvenid@ a *${gymName}* — Fábrica de Monstruos.`,
        ``,
        `Tu cuenta está lista 👊. Ahora elegí tu plan y activá tu membresía:`,
        `👉 ${portal}/planes`,
        ``,
        `*Beneficios*`,
        `✅ Acceso con QR en recepción`,
        `✅ Seguimiento de progreso en la app`,
        `✅ Cursos y rutinas de coaches certificados`,
        ``,
        `¿Tenés dudas? Respondé este chat y te ayudamos.`,
    ].join('\n');
}

/**
 * Upsell message for users registered ≥48h ago with no active membership.
 * Softer tone: "notamos que aún no eligís plan — acá tenés un código".
 */
export function renderUpsellMessage({ name, gymName = 'CED·GYM', appUrl, promoCode }) {
    const portal = appUrl || process.env.API_PUBLIC_URL?.replace('api.', 'cedgym.') || 'https://cedgym.187-77-11-79.sslip.io';
    const firstName = (name || '').split(' ')[0] || 'amig@';
    const promoLine = promoCode ? `\n🎁 Usá el código *${promoCode}* y ahorrá en tu primer mes.` : '';
    return [
        `Hola ${firstName} 👋`,
        ``,
        `Notamos que tu cuenta en ${gymName} todavía no tiene plan activo.${promoLine}`,
        ``,
        `Elegí el que mejor te queda:`,
        `👉 ${portal}/planes`,
        ``,
        `Tu primera semana sumá *fuerza, potencia y hábito*. Te acompañamos.`,
    ].join('\n');
}
