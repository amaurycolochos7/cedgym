// ─────────────────────────────────────────────────────────────
// Redis plugin — exposes `fastify.redis` (ioredis client).
// Used for OTP rate limiting, QR token cache, and generic
// throttling keys (`otp:rl:{phone}` etc.). The connection is lazy
// so tests/dev without REDIS_URL don't crash on boot — routes that
// touch Redis will fail with a clear error instead.
// ─────────────────────────────────────────────────────────────
import Redis from 'ioredis';

function asPlugin(plugin) {
    plugin[Symbol.for('skip-override')] = true;
    return plugin;
}

async function redisPlugin(fastify) {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    const redis = new Redis(url, {
        lazyConnect: false,
        maxRetriesPerRequest: 3,
        enableOfflineQueue: true,
    });

    redis.on('error', (err) => {
        fastify.log.warn({ err }, '[redis] connection error');
    });
    redis.on('connect', () => {
        fastify.log.info('[redis] connected');
    });

    fastify.decorate('redis', redis);
    fastify.addHook('onClose', async () => {
        try { await redis.quit(); } catch { /* ignore */ }
    });
}

export default asPlugin(redisPlugin);
