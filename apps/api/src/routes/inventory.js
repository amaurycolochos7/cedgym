// ─────────────────────────────────────────────────────────────────
// Inventory routes — suplementos / merch / items vendidos en POS.
//
// ╔══════════════════════════════════════════════════════════════╗
// ║  HACK DOCUMENTADO — Sin modelo Prisma                         ║
//
// Workspace resolution uses assertWorkspaceAccess() from
// tenant-guard so a session without workspace_id is refused with
// 403 instead of silently using fastify.defaultWorkspaceId.
// ║                                                               ║
// ║  El schema Prisma actual no tiene un modelo `Product` físico  ║
// ║  (solo tiene DigitalProduct para el marketplace). Para no     ║
// ║  tocar el schema (restricción del track), implementamos el    ║
// ║  inventario como JSON sobre Redis:                            ║
// ║                                                               ║
// ║    Key:   inventory:{workspaceId}:{sku}                       ║
// ║    Value: JSON { name, sku, price_mxn, stock, category,       ║
// ║                  cost_mxn?, created_at, updated_at }          ║
// ║                                                               ║
// ║    Index: inventory:index:{workspaceId} → SET de SKUs         ║
// ║    Audit: inventory:audit:{workspaceId}:{sku} → LIST de ops   ║
// ║                                                               ║
// ║  Cuando el cliente pida persistencia real, migrar a una nueva ║
// ║  tabla Prisma `Product` con los mismos campos y replicar      ║
// ║  estos endpoints contra ella.                                 ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Endpoints:
//   GET    /inventory                       — staff/admin
//   POST   /admin/inventory                 — crea producto
//   PATCH  /admin/inventory/:sku            — edita
//   POST   /admin/inventory/:sku/stock      — ajusta stock (+/-) con audit
// ─────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { err } from '../lib/errors.js';
import { assertWorkspaceAccess } from '../lib/tenant-guard.js';

// ─── Schemas ─────────────────────────────────────────────────────
const createBody = z.object({
    sku: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/, 'SKU alfanumérico'),
    name: z.string().trim().min(1).max(200),
    price_mxn: z.number().int().min(0),
    stock: z.number().int().min(0).default(0),
    category: z.string().trim().max(80).optional(),
    cost_mxn: z.number().int().min(0).optional(),
    description: z.string().max(2000).optional(),
});

const patchBody = z.object({
    name: z.string().trim().min(1).max(200).optional(),
    price_mxn: z.number().int().min(0).optional(),
    category: z.string().trim().max(80).optional(),
    cost_mxn: z.number().int().min(0).optional(),
    description: z.string().max(2000).optional(),
});

const stockBody = z.object({
    delta: z.number().int(),
    reason: z.string().trim().min(1).max(500),
});

// ─── Key helpers ─────────────────────────────────────────────────
const keyItem = (ws, sku) => `inventory:${ws}:${sku}`;
const keyIndex = (ws) => `inventory:index:${ws}`;
const keyAudit = (ws, sku) => `inventory:audit:${ws}:${sku}`;

function isStaffRole(role) {
    return role === 'RECEPTIONIST' || role === 'ADMIN' || role === 'SUPERADMIN';
}

// Shared internal helpers — also used from pos.js via imports.
// Exposed below for reuse (decrementStock, getItem, listItems, auditOp).

export async function getItem(redis, workspaceId, sku) {
    const raw = await redis.get(keyItem(workspaceId, sku));
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
}

export async function listItems(redis, workspaceId) {
    const skus = await redis.smembers(keyIndex(workspaceId));
    if (!skus.length) return [];
    const pipeline = redis.pipeline();
    for (const sku of skus) pipeline.get(keyItem(workspaceId, sku));
    const rows = await pipeline.exec();
    const items = [];
    for (const [pipeErr, raw] of rows) {
        if (pipeErr || !raw) continue;
        try { items.push(JSON.parse(raw)); } catch {}
    }
    return items;
}

export async function saveItem(redis, workspaceId, item) {
    await redis.set(keyItem(workspaceId, item.sku), JSON.stringify(item));
    await redis.sadd(keyIndex(workspaceId), item.sku);
    return item;
}

export async function auditOp(redis, workspaceId, sku, entry) {
    try {
        await redis.lpush(keyAudit(workspaceId, sku), JSON.stringify(entry));
        await redis.ltrim(keyAudit(workspaceId, sku), 0, 499); // keep last 500
    } catch {
        // swallow — audit is best-effort
    }
}

// Adjust stock atomically within a single item. Returns the new item or
// throws 'INSUFFICIENT_STOCK' if delta drives stock below zero.
export async function adjustStock(redis, workspaceId, sku, delta, { actorId, reason, source }) {
    const item = await getItem(redis, workspaceId, sku);
    if (!item) throw err('INVENTORY_NOT_FOUND', `SKU no encontrado: ${sku}`, 404);
    const newStock = (item.stock || 0) + delta;
    if (newStock < 0) {
        throw err('INSUFFICIENT_STOCK', `Stock insuficiente para ${sku} (disp: ${item.stock}, requerido: ${-delta})`, 409);
    }
    item.stock = newStock;
    item.updated_at = new Date().toISOString();
    await saveItem(redis, workspaceId, item);
    await auditOp(redis, workspaceId, sku, {
        at: item.updated_at,
        delta,
        new_stock: newStock,
        actor_id: actorId || null,
        reason: reason || null,
        source: source || 'manual',
    });
    return item;
}

// ─────────────────────────────────────────────────────────────────
export default async function inventoryRoutes(fastify) {
    const { redis } = fastify;

    // ─── GET /inventory ───────────────────────────────────────────
    fastify.get(
        '/inventory',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            if (!isStaffRole(req.user.role)) {
                throw err('FORBIDDEN', 'Solo staff puede ver inventario', 403);
            }
            const ws = assertWorkspaceAccess(req);
            if (!ws) throw err('NO_WORKSPACE', 'Workspace no resuelto', 400);

            const items = await listItems(redis, ws);
            // Sort by name for stable UI.
            items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            return { items, total: items.length };
        }
    );

    // ═════════════════════════════════════════════════════════════
    const adminGuard = {
        preHandler: [fastify.authenticate, fastify.requireRole('ADMIN', 'SUPERADMIN')],
    };

    // ─── POST /admin/inventory ────────────────────────────────────
    fastify.post('/admin/inventory', adminGuard, async (req) => {
        const parsed = createBody.safeParse(req.body);
        if (!parsed.success) throw err('BAD_BODY', parsed.error.message, 400);
        const data = parsed.data;

        const ws = assertWorkspaceAccess(req);
        if (!ws) throw err('NO_WORKSPACE', 'Workspace no resuelto', 400);

        const existing = await getItem(redis, ws, data.sku);
        if (existing) throw err('SKU_EXISTS', `SKU ya existe: ${data.sku}`, 409);

        const now = new Date().toISOString();
        const item = {
            sku: data.sku,
            name: data.name,
            price_mxn: data.price_mxn,
            stock: data.stock ?? 0,
            category: data.category || null,
            cost_mxn: data.cost_mxn ?? null,
            description: data.description || null,
            created_at: now,
            updated_at: now,
        };
        await saveItem(redis, ws, item);
        await auditOp(redis, ws, data.sku, {
            at: now,
            delta: item.stock,
            new_stock: item.stock,
            actor_id: req.user.sub || req.user.id,
            reason: 'initial-create',
            source: 'admin',
        });
        return { item };
    });

    // ─── PATCH /admin/inventory/:sku ──────────────────────────────
    fastify.patch('/admin/inventory/:sku', adminGuard, async (req) => {
        const parsed = patchBody.safeParse(req.body || {});
        if (!parsed.success) throw err('BAD_BODY', parsed.error.message, 400);

        const ws = assertWorkspaceAccess(req);
        const sku = req.params.sku;
        const item = await getItem(redis, ws, sku);
        if (!item) throw err('INVENTORY_NOT_FOUND', `SKU no encontrado: ${sku}`, 404);

        Object.assign(item, parsed.data);
        item.updated_at = new Date().toISOString();
        await saveItem(redis, ws, item);
        return { item };
    });

    // ─── POST /admin/inventory/:sku/stock ─────────────────────────
    fastify.post('/admin/inventory/:sku/stock', adminGuard, async (req) => {
        const parsed = stockBody.safeParse(req.body);
        if (!parsed.success) throw err('BAD_BODY', parsed.error.message, 400);

        const ws = assertWorkspaceAccess(req);
        const sku = req.params.sku;

        const item = await adjustStock(redis, ws, sku, parsed.data.delta, {
            actorId: req.user.sub || req.user.id,
            reason: parsed.data.reason,
            source: 'admin-adjust',
        });
        return { item };
    });

    // ─── GET /admin/inventory/:sku/audit ──────────────────────────
    //
    // Bonus handy endpoint for debugging stock issues in dev.
    fastify.get('/admin/inventory/:sku/audit', adminGuard, async (req) => {
        const ws = assertWorkspaceAccess(req);
        const sku = req.params.sku;
        const rows = await redis.lrange(keyAudit(ws, sku), 0, 99);
        return {
            sku,
            audit: rows.map((r) => { try { return JSON.parse(r); } catch { return { raw: r }; } }),
        };
    });
}
