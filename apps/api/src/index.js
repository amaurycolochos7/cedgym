// ═══════════════════════════════════════════════════════════════
// CED-GYM API — Fastify 5 entrypoint.
// Boot order matters:
//   1. helmet (response headers — must run first)
//   2. cors / cookies / jwt
//   3. prisma / redis decorators
//   4. rate-limit (uses Redis store from step 3)
//   5. auth decorator (depends on jwt)
//   6. autoload routes
//   7. resolve defaultWorkspaceId (needs prisma)
//   8. listen
// ═══════════════════════════════════════════════════════════════
import 'dotenv/config';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import autoload from '@fastify/autoload';

import prismaPlugin from './plugins/prisma.js';
import redisPlugin from './plugins/redis.js';
import authPlugin from './plugins/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IS_PROD = process.env.NODE_ENV === 'production';

// Load a critical secret from env. Fails hard in production if missing
// or too short — never serve a single request without a strong secret.
// In development, generates an ephemeral random secret per process so
// dev keeps working but stale tokens don't outlive a restart (which is
// safer than a known shared dev string).
function loadSecret(name, { minLength = 32 } = {}) {
    const v = process.env[name];
    if (typeof v === 'string' && v.length >= minLength) return v;
    if (IS_PROD) {
        // Hard exit BEFORE any HTTP listener is up.
        const reason = !v ? 'missing' : `shorter than ${minLength} chars`;
        console.error(
            `[FATAL] ${name} is ${reason} in production. ` +
            `Set it (Dokploy env / secret manager) and restart. Aborting boot.`
        );
        process.exit(1);
    }
    const ephemeral = crypto.randomBytes(48).toString('hex');
    console.warn(
        `[BOOT] ⚠️  ${name} not set — using ephemeral dev secret ` +
        `(sessions invalidate on restart). Set ${name} for stable dev sessions.`
    );
    return ephemeral;
}

const JWT_SECRET = loadSecret('JWT_SECRET');

const fastify = Fastify({
    logger: {
        level: process.env.LOG_LEVEL || 'info',
    },
    // ── Timeouts: defend against slow-loris and connection exhaustion ──
    // Fastify's defaults leave most of these at 0 / Node's defaults
    // (10 min request timeout, no connection cap), which lets a single
    // attacker trickle bytes for hours and pin file descriptors.
    // requestTimeout is 120 s (not 30 s) because /ai/meal-plans/generate
    // and /ai/routines/generate make synchronous OpenAI calls that
    // routinely take 30-90 s for a full plan. Slow-loris is still
    // bounded by connectionTimeout (10 s for the handshake) so a stalled
    // connection can't stay open forever.
    connectionTimeout: 10_000,   // 10 s to complete the TCP/TLS handshake
    keepAliveTimeout: 5_000,     // 5 s idle on a keep-alive socket
    requestTimeout: 120_000,     // 2 min end-to-end (AI endpoints need it)
    bodyLimit: 1_048_576,        // 1 MB max body — explicit, was the default
});

// ── Core plugins ────────────────────────────────────────────
// Helmet first so its headers (HSTS, X-Frame, X-Content-Type, CSP)
// land on every response — including CORS preflights and 4xx errors.
// CSP is locked to default-src 'none' because this is a JSON API:
// nothing is rendered, so nothing should ever load. frame-ancestors
// 'none' double-locks against clickjacking on top of X-Frame-Options.
await fastify.register(helmet, {
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'none'"],
            frameAncestors: ["'none'"],
        },
    },
    hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
});

// Strip server-fingerprint headers on every response. Fastify doesn't
// add X-Powered-By by default, but defence in depth — a future plugin
// might, and Server: leaks the runtime version.
fastify.addHook('onSend', async (_req, reply) => {
    reply.removeHeader('Server');
    reply.removeHeader('X-Powered-By');
});

// Hardcoded production origins. CORS_ORIGINS env (comma-list) is
// additive — used by Dokploy to add the Vercel URL without a redeploy.
// We narrowed away the previous `*.sslip.io` wildcard and the
// substring `.includes('localhost')` check (which let
// `https://evil.com/?u=localhost` through).
const STATIC_ORIGINS = [
    'https://cedgym.mx',
    'https://www.cedgym.mx',
    'https://api.187-77-11-79.sslip.io', // self, for in-cluster fetches
];
// Vercel preview URLs: project + optional `-<sha>` suffix.
const VERCEL_PREVIEW_RE = /^https:\/\/cedgym(-[a-z0-9-]+)?\.vercel\.app$/;
// Dev-only loopback. Locked to http:// + numeric port — won't match
// `http://localhost.attacker.com`.
const LOOPBACK_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

await fastify.register(cors, {
    origin: (origin, cb) => {
        if (!origin) {
            if (process.env.CORS_ALLOW_NO_ORIGIN === 'true') return cb(null, true);
            return cb(null, false);
        }
        const envOrigins = process.env.CORS_ORIGINS
            ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
            : [];
        if (STATIC_ORIGINS.includes(origin)) return cb(null, true);
        if (envOrigins.includes(origin)) return cb(null, true);
        if (VERCEL_PREVIEW_RE.test(origin)) return cb(null, true);
        if (!IS_PROD && LOOPBACK_RE.test(origin)) return cb(null, true);
        // Reject silently — the browser shows a normal CORS denial,
        // we don't want every blocked request to surface as a 500.
        return cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
});

await fastify.register(cookie, {
    secret: process.env.COOKIE_SECRET || JWT_SECRET,
    parseOptions: {},
});

await fastify.register(jwt, {
    secret: JWT_SECRET,
    // We expose the token only via the `authorization: Bearer` header.
    // Refresh tokens live in a cookie and are opaque (not JWTs).
});

// ── Our plugins (Prisma + Redis decorators) ─────────────────
// Registered before rate-limit so the rate-limit plugin can pick
// up the shared Redis client and keep counters consistent across
// API instances (instead of the in-memory store, which is per-pod).
await fastify.register(prismaPlugin);
await fastify.register(redisPlugin);

await fastify.register(rateLimit, {
    global: false,
    max: 120,
    timeWindow: '1 minute',
    // Shared store: counters are coherent across replicas. Falls back
    // to in-memory if redisPlugin failed to connect (warned at boot).
    redis: fastify.redis,
    errorResponseBuilder: (_req, ctx) => ({
        error: {
            code: 'RATE_LIMITED',
            message: `Demasiados intentos. Intenta de nuevo en ${Math.ceil(ctx.ttl / 1000)}s.`,
        },
        statusCode: 429,
    }),
});

await fastify.register(authPlugin);

// Cache the default workspace id once at boot. Routes that create
// users read it off `fastify.defaultWorkspaceId`.
fastify.decorate('defaultWorkspaceId', null);
async function resolveDefaultWorkspaceId() {
    try {
        const ws = await fastify.prisma.workspace.findUnique({ where: { slug: 'ced-gym' } });
        if (ws) {
            fastify.defaultWorkspaceId = ws.id;
            fastify.log.info({ workspace_id: ws.id }, '[boot] default workspace resolved');
        } else {
            fastify.log.warn('[boot] default workspace "ced-gym" not found — run `node src/seed.js`');
        }
    } catch (e) {
        fastify.log.warn({ err: e }, '[boot] could not resolve default workspace');
    }
}
await resolveDefaultWorkspaceId();

// ── Global error handler — normalize thrown err() instances ─
fastify.setErrorHandler((error, request, reply) => {
    if (error.validation) {
        return reply.status(400).send({
            error: {
                code: 'VALIDATION',
                message: error.message,
                details: error.validation,
            },
            statusCode: 400,
        });
    }
    const statusCode = error.statusCode || 500;
    const payload = {
        error: {
            code: error.code || 'INTERNAL',
            message: error.expose || statusCode < 500
                ? (error.message || 'Error')
                : 'Error interno del servidor',
            ...(error.details ? { details: error.details } : {}),
        },
        statusCode,
    };
    if (statusCode >= 500) {
        request.log.error({ err: error }, 'request failed');
    }
    return reply.status(statusCode).send(payload);
});

// ── Health + Routes ──────────────────────────────────────────
// /health is public — Dokploy hits it for probes. Cap to 60 rpm/IP
// so a bot can't pin it as a recon endpoint.
fastify.get(
    '/health',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async () => ({ status: 'ok', service: 'cedgym-api' })
);

// Autoload every file in routes/. Each route module exports an
// `autoPrefix` string so `routes/auth.js` mounts under `/auth/*`.
await fastify.register(autoload, {
    dir: path.join(__dirname, 'routes'),
    dirNameRoutePrefix: false,
    matchFilter: (p) => p.endsWith('.js'),
    options: {},
});

// ── Listen ──────────────────────────────────────────────────
const PORT = Number(process.env.API_PORT || process.env.PORT || 3001);
const HOST = process.env.API_HOST || '0.0.0.0';
try {
    await fastify.listen({ port: PORT, host: HOST });
    fastify.log.info(`🏋️  CED-GYM API listening on ${HOST}:${PORT}`);
} catch (err) {
    fastify.log.error(err);
    process.exit(1);
}
