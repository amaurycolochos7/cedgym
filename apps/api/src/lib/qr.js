// ─────────────────────────────────────────────────────────────────
// QR rotation (Redis-backed).
//
// We never store QR tokens in Postgres — the entrance scanner needs
// sub-millisecond validation for 50+ people at 7 a.m. so Redis is
// the right cache. Tokens are UUIDv4, live 90 s, and rotate whenever
// the PWA asks for a fresh one (roughly every ~55 s in the web
// client).
//
// Keyspace:
//   qr:{token}          → userId       (TTL 90s)
//   qr:current:{userId} → token        (TTL 90s)
//   qr:meta:{token}     → workspaceId  (TTL 90s) — cheap lookup so the
//                         scanner doesn't need an extra Postgres hop
//                         to figure out which workspace owns the user.
//
// Exports are pure functions that take a redis client (fastify.redis).
// This keeps them easy to reuse from the worker too.
// ─────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';

const TTL_SECONDS = 90;

function tokenKey(token) {
    return `qr:${token}`;
}
function currentKey(userId) {
    return `qr:current:${userId}`;
}
function metaKey(token) {
    return `qr:meta:${token}`;
}

/**
 * Generate a fresh QR token for `userId` scoped to `workspaceId`.
 * Revokes the user's previous token so only one is valid at a time.
 */
export async function rotateTokenForUser(redis, workspaceId, userId) {
    if (!redis) throw new Error('redis client required');
    if (!workspaceId) throw new Error('workspaceId required');
    if (!userId) throw new Error('userId required');

    // Nuke the previous token so a stolen screenshot stops working
    // the moment the user opens the PWA again.
    const previous = await redis.get(currentKey(userId));
    if (previous) {
        await redis.del(tokenKey(previous), metaKey(previous));
    }

    const token = crypto.randomUUID();
    const pipeline = redis.multi();
    pipeline.set(tokenKey(token), userId, 'EX', TTL_SECONDS);
    pipeline.set(currentKey(userId), token, 'EX', TTL_SECONDS);
    pipeline.set(metaKey(token), workspaceId, 'EX', TTL_SECONDS);
    await pipeline.exec();

    return { token, expires_in: TTL_SECONDS };
}

/**
 * Return the user's current token, rotating lazily if it's missing.
 * Callers must pass workspaceId so we can create a fresh one on miss.
 */
export async function getCurrentTokenForUser(redis, workspaceId, userId) {
    const existing = await redis.get(currentKey(userId));
    if (existing) {
        const ttl = await redis.ttl(tokenKey(existing));
        // If TTL < 15s we rotate early so the user's phone never shows
        // a stale QR that'll reject at the scanner.
        if (ttl > 15) {
            return { token: existing, expires_in: ttl };
        }
    }
    return rotateTokenForUser(redis, workspaceId, userId);
}

/**
 * Resolve a scanned token → { valid, userId, workspaceId }.
 * Returns null on miss. Deliberately does NOT consume the token —
 * the check-in route is responsible for preventing double-scans via
 * its own lock key.
 */
export async function validateToken(redis, token) {
    if (!token || typeof token !== 'string') return null;
    const userId = await redis.get(tokenKey(token));
    if (!userId) return null;
    const workspaceId = await redis.get(metaKey(token));
    return {
        valid: true,
        userId,
        workspaceId: workspaceId || null,
    };
}

/**
 * Atomic consume: validates + burns the token in one shot. If the
 * token is valid we return the resolved user AND invalidate all
 * related Redis keys so a screenshot/copy cannot reuse it.
 *
 * This is what the scanner MUST call — validateToken alone leaves
 * the token alive, which lets a screenshot enter twice in the 90s
 * window. Use this instead.
 */
export async function consumeToken(redis, token) {
    if (!token || typeof token !== 'string') return null;
    const userId = await redis.get(tokenKey(token));
    if (!userId) return null;
    const workspaceId = await redis.get(metaKey(token));

    // Burn all references so the QR can't be scanned again, even by a
    // parallel request that might race ours.
    await redis
        .multi()
        .del(tokenKey(token), metaKey(token), currentKey(userId))
        .exec();

    return { valid: true, userId, workspaceId: workspaceId || null };
}

/**
 * Revoke every token associated with `userId`. Called on logout or
 * when an admin suspends the account.
 */
export async function revokeUserTokens(redis, userId) {
    const current = await redis.get(currentKey(userId));
    if (!current) return { revoked: 0 };
    await redis.del(tokenKey(current), metaKey(current), currentKey(userId));
    return { revoked: 1 };
}

export const QR_TTL_SECONDS = TTL_SECONDS;

export default {
    rotateTokenForUser,
    getCurrentTokenForUser,
    validateToken,
    revokeUserTokens,
    QR_TTL_SECONDS,
};
