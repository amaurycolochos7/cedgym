// ─────────────────────────────────────────────────────────────
// OTP helpers — generation, hashing, WhatsApp delivery.
//
// Design notes:
//   - OTP is 6 digits, zero-padded, generated via crypto.randomInt
//     (biased-free, cryptographically strong) — not Math.random.
//   - We store bcrypt(code) in OtpCode.code_hash. cost=10 gives a
//     ~80ms compare on modest hardware — fine for a single
//     attempt, and keeps us consistent with password hashing.
//   - Delivery is via the internal WhatsApp bot HTTP contract:
//       POST {WHATSAPP_BOT_URL}/send-message
//       headers: x-api-key: WHATSAPP_BOT_KEY
//       body:    { workspaceId, phone, message }
//   - If delivery fails we do NOT rollback the OTP row — the user
//     can hit /auth/otp/resend to get a fresh code without losing
//     their registration progress.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

export const OTP_TTL_MIN = 10;
export const OTP_MAX_ATTEMPTS = 5;

export function generateOtpCode() {
    // randomInt is exclusive of the upper bound. [0, 1_000_000) →
    // 6-digit codes with full 0-padding.
    const n = crypto.randomInt(0, 1_000_000);
    return String(n).padStart(6, '0');
}

export async function hashOtpCode(code) {
    return bcrypt.hash(code, 10);
}

export async function compareOtpCode(code, hash) {
    return bcrypt.compare(code, hash);
}

export function otpExpiresAt() {
    return new Date(Date.now() + OTP_TTL_MIN * 60 * 1000);
}

// ── WhatsApp templates ───────────────────────────────────────
const TEMPLATES = {
    REGISTER: (code) =>
        `🏋️ *CED-GYM*\n\nTu código de verificación es:\n\n*${code}*\n\nExpira en ${OTP_TTL_MIN} minutos. Si no solicitaste este código, ignora este mensaje.`,
    PASSWORD_RESET: (code) =>
        `🔐 *Recuperación de contraseña*\n\nTu código es:\n\n*${code}*\n\nExpira en ${OTP_TTL_MIN} minutos. Nadie de CED-GYM te pedirá este código.`,
    LOGIN_2FA: (code) =>
        `🔑 Código de acceso CED-GYM:\n\n*${code}*\n\nVálido ${OTP_TTL_MIN} min.`,
    PHONE_CHANGE: (code) =>
        `📱 *Cambio de teléfono*\n\nTu código es:\n\n*${code}*\n\nExpira en ${OTP_TTL_MIN} minutos.`,
};

export function renderOtpMessage(purpose, code) {
    const tpl = TEMPLATES[purpose];
    if (!tpl) throw new Error(`Unknown OTP purpose: ${purpose}`);
    return tpl(code);
}

// Dev-only helper: emit the plaintext OTP to stdout so local devs can
// copy/paste it into the verify form without needing a real WhatsApp
// client paired to the bot. MUST remain guarded by NODE_ENV — in prod
// we never log codes in clear.
export function logOtpForDev({ phone, purpose, code, logger }) {
    if (process.env.NODE_ENV === 'production') return;
    const line = `[OTP DEV] phone=${phone} purpose=${purpose} code=${code} expires_in=${OTP_TTL_MIN}min`;
    // Prefer fastify logger for structured context; also write to stdout
    // so it shows up even if the logger is piped elsewhere.
    if (logger?.info) logger.info(line);
    // eslint-disable-next-line no-console
    console.log(line);
}

// Sends the OTP via the internal bot. Returns `{ ok: boolean, error?: string }`
// rather than throwing so the caller can choose whether to surface the
// failure to the user or just log it. The API contract mirrors
// motopartes' bot proxy.
//
// Side-effect: in non-production environments we emit the plaintext code
// to stdout via `logOtpForDev` so local developers can complete the flow
// without a real phone. This happens regardless of whether delivery
// succeeds — the code is always visible to dev.
export async function sendOtpViaWhatsApp({ workspaceId, phone, code, purpose, logger }) {
    // Dev visibility first — even if the bot call explodes below, the
    // dev can still grab the code from logs.
    logOtpForDev({ phone, purpose, code, logger });

    const url = process.env.WHATSAPP_BOT_URL;
    const key = process.env.WHATSAPP_BOT_KEY;
    if (!url || !key) {
        logger?.warn('[otp] WHATSAPP_BOT_URL or WHATSAPP_BOT_KEY missing — OTP NOT sent');
        return { ok: false, error: 'bot_not_configured' };
    }
    const message = renderOtpMessage(purpose, code);
    try {
        const res = await fetch(`${url}/send-message`, {
            method: 'POST',
            headers: {
                'x-api-key': key,
                'content-type': 'application/json',
            },
            body: JSON.stringify({ workspaceId, phone, message }),
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            logger?.warn({ status: res.status, text }, '[otp] bot returned non-200');
            return { ok: false, error: `bot_status_${res.status}` };
        }
        return { ok: true };
    } catch (e) {
        // Expected when the bot container isn't running or WhatsApp isn't
        // paired yet. We NEVER want this to cascade to a 500 at the user
        // — the caller decides how to surface it. The OTP row in DB is
        // still valid; user can retry via resend.
        logger?.warn({ err: e }, '[otp] bot fetch failed');
        return { ok: false, error: e.message || 'fetch_failed' };
    }
}

// ── Rate limit helper (Redis) ─────────────────────────────────
// Contract: 1 resend per 60s, max 5 per hour per phone.
// Uses two keys: `otp:rl:cooldown:{phone}` (60s TTL) and
// `otp:rl:hour:{phone}` (counter with 3600s TTL).
export async function checkAndBumpOtpRateLimit(redis, phone) {
    const cooldownKey = `otp:rl:cooldown:${phone}`;
    const hourKey = `otp:rl:hour:${phone}`;

    const cooldown = await redis.get(cooldownKey);
    if (cooldown) {
        const ttl = await redis.ttl(cooldownKey);
        return { ok: false, reason: 'cooldown', retryAfterSec: ttl > 0 ? ttl : 60 };
    }

    const hourCount = Number(await redis.get(hourKey)) || 0;
    if (hourCount >= 5) {
        const ttl = await redis.ttl(hourKey);
        return { ok: false, reason: 'hourly_limit', retryAfterSec: ttl > 0 ? ttl : 3600 };
    }

    // Bump both counters. Use a pipeline so we don't pay 2 RTTs.
    const pipe = redis.pipeline();
    pipe.set(cooldownKey, '1', 'EX', 60);
    pipe.incr(hourKey);
    pipe.expire(hourKey, 3600);
    await pipe.exec();

    return { ok: true };
}
