// ─────────────────────────────────────────────────────────────
// JWT helpers — thin wrappers over @fastify/jwt.
//   - Access token carries { sub, email, role, workspace_id }.
//   - Refresh token is opaque, hashed en DB; rotado en cada uso.
//
// TTLs por rol (seguridad vs. UX):
//   ADMIN/SUPERADMIN : 1h access / 24h refresh   (sensibilidad alta)
//   RECEPTIONIST : 4h access / 3d refresh         (turno operativo)
//   ATHLETE : 8h access / 30d refresh            (app fitness, quieren "siempre dentro")
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// TTL matrix (segundos) por rol.
const TTL_BY_ROLE = {
    SUPERADMIN:   { access: 1 * HOUR, refresh: 24 * HOUR },
    ADMIN:        { access: 1 * HOUR, refresh: 24 * HOUR },
    RECEPTIONIST: { access: 4 * HOUR, refresh: 3 * DAY },
    ATHLETE:      { access: 8 * HOUR, refresh: 30 * DAY },
};

const DEFAULT_TTL = TTL_BY_ROLE.ATHLETE;

export function ttlForRole(role) {
    return TTL_BY_ROLE[role] ?? DEFAULT_TTL;
}

// Mantenemos exports legacy para compatibilidad con código que las lee
// directamente (ej: refreshCookieOptions() necesita un maxAge para el cookie
// genérico — usamos el máximo, 30d, para que no trunque sesiones de atletas).
export const ACCESS_TTL_SEC  = TTL_BY_ROLE.ATHLETE.access;   // 8h
export const REFRESH_TTL_SEC = TTL_BY_ROLE.ATHLETE.refresh;  // 30d

// Access token firmado con TTL según rol.
export function signAccess(fastify, user) {
    const { access } = ttlForRole(user.role);
    return fastify.jwt.sign(
        {
            sub: user.id,
            email: user.email,
            role: user.role,
            workspace_id: user.workspace_id,
        },
        { expiresIn: access }
    );
}

// Refresh token: opaque random (no JWT), hasheado con bcrypt en DB.
export function mintRefreshToken() {
    return crypto.randomBytes(32).toString('base64url');
}

export async function hashRefreshToken(raw) {
    return bcrypt.hash(raw, 10);
}

export async function compareRefreshToken(raw, hash) {
    return bcrypt.compare(raw, hash);
}

// refresh cookie maxAge = TTL máximo (atleta 30d) para que el browser
// nunca lo descarte antes que la DB. La validez real la corta la DB.
export function refreshCookieOptions(role) {
    const { refresh } = ttlForRole(role);
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/auth',
        maxAge: refresh,
    };
}

export const REFRESH_COOKIE_NAME = 'cedgym_rt';

// ─────────────────────────────────────────────────────────────
// Welcome tokens — single-use, 7-day signed link a recién-inscrito
// recibe por WhatsApp para crear su contraseña + subir selfie.
// ─────────────────────────────────────────────────────────────
const WELCOME_TTL_SEC = 7 * DAY;

export function signWelcomeToken(fastify, userId) {
    return fastify.jwt.sign(
        { sub: userId, type: 'welcome' },
        { expiresIn: WELCOME_TTL_SEC }
    );
}

// Verifica un welcome token y devuelve el userId, o lanza err con
// `code: WELCOME_TOKEN_INVALID` si está mal/expirado.
export function verifyWelcomeToken(fastify, token) {
    const decoded = fastify.jwt.verify(token); // throws on bad sig / expiry
    if (decoded?.type !== 'welcome' || !decoded?.sub) {
        const e = new Error('Token inválido');
        e.code = 'WELCOME_TOKEN_INVALID';
        e.statusCode = 401;
        throw e;
    }
    return decoded.sub;
}
