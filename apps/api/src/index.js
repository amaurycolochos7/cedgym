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
import { fileURLToPath } from 'node:url';

import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import autoload from '@fastify/autoload';

import prismaPlugin from './plugins/prisma.js';
import redisPlugin from './plugins/redis.js';
import authPlugin from './plugins/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const JWT_FALLBACK = 'cedgym-dev-secret-change-me';
const JWT_SECRET = process.env.JWT_SECRET || JWT_FALLBACK;
if (JWT_SECRET === JWT_FALLBACK) {
    console.warn('[AUTH] ⚠️ JWT_SECRET env var not set — using dev default. Rotate before production.');
}

const fastify = Fastify({
    logger: {
        level: process.env.LOG_LEVEL || 'info',
    },
});

// ── Core plugins ────────────────────────────────────────────
await fastify.register(cors, {
    origin: (origin, cb) => {
        const envOrigins = process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : [];
        const allowed = [
            'https://cedgym.mx',
            'https://www.cedgym.mx',
            ...envOrigins,
        ];
        if (!origin) {
            // Allow no-origin requests (curl, server-to-server) only if
            // explicitly opted in — otherwise reject silently.
            if (process.env.CORS_ALLOW_NO_ORIGIN === 'true') return cb(null, true);
            return cb(null, false);
        }
        if (allowed.includes(origin) || origin.includes('localhost') || origin.includes('127.0.0.1')) {
            return cb(null, true);
        }
        cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
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
