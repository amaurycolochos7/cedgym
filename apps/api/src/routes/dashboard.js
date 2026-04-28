// ─────────────────────────────────────────────────────────────────
// Admin dashboard — analytics endpoints (Fase 5).
//
// All endpoints are ADMIN/SUPERADMIN-gated and scoped to the
// admin's own workspace. Results are cached in Redis for 5 min so
// the admin UI can poll freely without hammering Postgres.
//
// Cache key:  dashboard:{workspace}:{endpoint}:{paramsHash}
// ─────────────────────────────────────────────────────────────────

import { z } from 'zod';
import crypto from 'node:crypto';
import { err } from '../lib/errors.js';
import { assertWorkspaceAccess } from '../lib/tenant-guard.js';
import {
    revenueByPeriod,
    membershipRetention,
    checkinsHeatmap,
    churnPrediction,
    overviewKpis,
} from '../lib/analytics.js';

const CACHE_TTL_SEC = 5 * 60;

function hashParams(obj) {
    const stable = JSON.stringify(obj || {}, Object.keys(obj || {}).sort());
    return crypto.createHash('sha1').update(stable).digest('hex').slice(0, 12);
}

// Small wrapper: tries Redis first, falls back to fn() on miss.
// Never throws — cache issues degrade to a direct call.
async function cached(redis, key, ttl, fn) {
    try {
        const hit = await redis.get(key);
        if (hit) {
            return { ...JSON.parse(hit), _cached: true };
        }
    } catch {
        /* cache miss or redis error — fall through */
    }
    const payload = await fn();
    try {
        await redis.set(key, JSON.stringify(payload), 'EX', ttl);
    } catch {
        /* best-effort */
    }
    return payload;
}

// Resolves the admin's workspace_id straight from the JWT — no DB hop,
// no defaultWorkspaceId fallback (that fallback let workspace-less
// sessions silently operate on the system workspace; the central
// guard rejects them with 403 instead). Kept async so callers don't
// need to drop their `await`.
async function adminWorkspace(_fastify, req) {
    return assertWorkspaceAccess(req);
}

// ─── Schemas ────────────────────────────────────────────────
const revenueQuery = z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    groupBy: z.enum(['day', 'week', 'month']).default('day'),
});

const retentionQuery = z.object({
    period: z.enum(['3m', '6m', '12m', '1y']).default('6m'),
});

const heatmapQuery = z.object({
    days: z.coerce.number().int().min(1).max(180).default(30),
});

const churnQuery = z.object({
    days: z.coerce.number().int().min(7).max(90).default(30),
    threshold: z.coerce.number().min(0.1).max(1).default(0.6),
    expected: z.coerce.number().int().min(1).max(60).default(12),
});

// ─────────────────────────────────────────────────────────────
export default async function dashboardRoutes(fastify) {
    const { redis } = fastify;

    const guard = {
        preHandler: [
            fastify.authenticate,
            fastify.requireRole('ADMIN', 'SUPERADMIN'),
        ],
    };

    // ─── GET /admin/dashboard/overview ──────────────────────────
    fastify.get('/admin/dashboard/overview', guard, async (req) => {
        const ws = await adminWorkspace(fastify, req);
        if (!ws) throw err('NO_WORKSPACE', 'Workspace no resuelto', 500);
        const key = `dashboard:${ws}:overview`;
        return cached(redis, key, CACHE_TTL_SEC, () => overviewKpis(ws));
    });

    // ─── GET /admin/dashboard/revenue ───────────────────────────
    fastify.get('/admin/dashboard/revenue', guard, async (req) => {
        const parsed = revenueQuery.safeParse(req.query || {});
        if (!parsed.success) throw err('BAD_QUERY', parsed.error.message, 400);
        const ws = await adminWorkspace(fastify, req);
        const key = `dashboard:${ws}:revenue:${hashParams(parsed.data)}`;
        return cached(redis, key, CACHE_TTL_SEC, () =>
            revenueByPeriod(ws, parsed.data)
        );
    });

    // ─── GET /admin/dashboard/retention ─────────────────────────
    fastify.get('/admin/dashboard/retention', guard, async (req) => {
        const parsed = retentionQuery.safeParse(req.query || {});
        if (!parsed.success) throw err('BAD_QUERY', parsed.error.message, 400);
        const ws = await adminWorkspace(fastify, req);
        const key = `dashboard:${ws}:retention:${hashParams(parsed.data)}`;
        return cached(redis, key, CACHE_TTL_SEC, () =>
            membershipRetention(ws, parsed.data.period)
        );
    });

    // ─── GET /admin/dashboard/heatmap ───────────────────────────
    fastify.get('/admin/dashboard/heatmap', guard, async (req) => {
        const parsed = heatmapQuery.safeParse(req.query || {});
        if (!parsed.success) throw err('BAD_QUERY', parsed.error.message, 400);
        const ws = await adminWorkspace(fastify, req);
        const key = `dashboard:${ws}:heatmap:${hashParams(parsed.data)}`;
        return cached(redis, key, CACHE_TTL_SEC, () =>
            checkinsHeatmap(ws, { days: parsed.data.days })
        );
    });

    // ─── GET /admin/dashboard/churn-risk ────────────────────────
    fastify.get('/admin/dashboard/churn-risk', guard, async (req) => {
        const parsed = churnQuery.safeParse(req.query || {});
        if (!parsed.success) throw err('BAD_QUERY', parsed.error.message, 400);
        const ws = await adminWorkspace(fastify, req);
        const key = `dashboard:${ws}:churn:${hashParams(parsed.data)}`;
        return cached(redis, key, CACHE_TTL_SEC, () =>
            churnPrediction(ws, parsed.data)
        );
    });
}
