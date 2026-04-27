// ═══════════════════════════════════════════════════════════════
// CED-GYM API — Fastify 5 entrypoint.
// Boot order matters:
//   1. cors / cookies / jwt / rate-limit
//   2. prisma / redis decorators
//   3. auth decorator (depends on jwt)
//   4. autoload routes
//   5. resolve defaultWorkspaceId (needs prisma)
//   6. listen
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
    connectionTimeout: 10_000,   // 10 s to complete the TCP/TLS handshake
    keepAliveTimeout: 5_000,     // 5 s idle on a keep-alive socket
    requestTimeout: 30_000,      // 30 s end-to-end for any single request
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

await fastify.register(cors, {
    origin: (origin, cb) => {
        const envOrigins = process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : [];
        const allowed = [
            'https://cedgym.mx',
            'https://www.cedgym.mx',
            ...envOrigins,
        ];
        if (!origin) {
            if (process.env.CORS_ALLOW_NO_ORIGIN === 'true') return cb(null, true);
            return cb(null, false);
        }
        // Exact-match list + localhost (dev) + *.sslip.io (staging/preview
        // deploys that use plain-IP domains via the sslip.io DNS wildcard).
        // Previously we threw `new Error('Not allowed by CORS')` for
        // unknown origins, which bubbled up as a generic 500 on every
        // login attempt from a staging host. Reject silently with
        // `cb(null, false)` instead — the browser gets a normal CORS
        // denial, not a crashed server.
        if (
            allowed.includes(origin) ||
            origin.includes('localhost') ||
            origin.includes('127.0.0.1') ||
            /\.sslip\.io$/.test(new URL(origin).hostname)
        ) {
            return cb(null, true);
        }
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

await fastify.register(rateLimit, {
    global: false,
    max: 120,
    timeWindow: '1 minute',
    errorResponseBuilder: (_req, ctx) => ({
        error: {
            code: 'RATE_LIMITED',
            message: `Demasiados intentos. Intenta de nuevo en ${Math.ceil(ctx.ttl / 1000)}s.`,
        },
        statusCode: 429,
    }),
});

// ── Our plugins ──────────────────────────────────────────────
await fastify.register(prismaPlugin);
await fastify.register(redisPlugin);
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
fastify.get('/health', async () => ({ status: 'ok', service: 'cedgym-api' }));

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
