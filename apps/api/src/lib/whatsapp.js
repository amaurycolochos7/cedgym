// ═══════════════════════════════════════════════════════════════
// CED-GYM — Canonical WhatsApp sender (fire-and-forget friendly).
// ═══════════════════════════════════════════════════════════════
import { detectGender } from './gender.js';

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
    const firstName = (name || '').split(' ')[0] || '';
    const gender = detectGender(firstName);
    // Greeting adapts to detected gender; 'X' (unknown) falls back to
    // the neutral "Bienvenid@" so we never mis-gender.
    let greeting;
    if (gender === 'M') {
        greeting = `💪 ¡Hola ${firstName}! Bienvenido a *${gymName}*, listo para entrenar.`;
    } else if (gender === 'F') {
        greeting = `💪 ¡Hola ${firstName}! Bienvenida a *${gymName}*, lista para entrenar.`;
    } else {
        const safeName = firstName || 'atleta';
        greeting = `💪 ¡Hola ${safeName}! Bienvenid@ a *${gymName}* — Fábrica de Monstruos.`;
    }
    return [
        greeting,
        ``,
        `Tu cuenta está lista 👊. Ahora elige tu plan y activa tu membresía:`,
        `👉 ${portal}/planes`,
        ``,
        `*Beneficios*`,
        `✅ Acceso con QR en recepción`,
        `✅ Seguimiento de progreso en la app`,
        `✅ Cursos y rutinas de coaches certificados`,
        ``,
        `¿Tienes dudas? Responde este chat y te ayudamos.`,
    ].join('\n');
}

/**
 * Upsell message for users registered ≥48h ago with no active membership.
 * Softer tone: "notamos que aún no eliges plan — acá tienes un código".
 */
export function renderUpsellMessage({ name, gymName = 'CED·GYM', appUrl, promoCode }) {
    const portal = appUrl || process.env.API_PUBLIC_URL?.replace('api.', 'cedgym.') || 'https://cedgym.187-77-11-79.sslip.io';
    const firstName = (name || '').split(' ')[0] || 'amig@';
    const gender = detectGender(firstName);
    const listoLine =
        gender === 'M'
            ? `¿Listo para entrenar? Elige el plan que mejor te queda:`
            : gender === 'F'
            ? `¿Lista para entrenar? Elige el plan que mejor te queda:`
            : `Elige el plan que mejor te queda:`;
    const promoLine = promoCode ? `\n🎁 Usa el código *${promoCode}* y ahorra en tu primer mes.` : '';
    return [
        `Hola ${firstName} 👋`,
        ``,
        `Notamos que tu cuenta en ${gymName} todavía no tiene plan activo.${promoLine}`,
        ``,
        listoLine,
        `👉 ${portal}/planes`,
        ``,
        `Tu primera semana suma *fuerza, potencia y hábito*. Te acompañamos.`,
    ].join('\n');
}
