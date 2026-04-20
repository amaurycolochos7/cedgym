// ─────────────────────────────────────────────────────────────────
// POS — Point of sale (front desk quick sales).
//
// Staff (RECEPTIONIST+):
//   POST /pos/sale                 — create a sale
//   GET  /pos/sales                — list today's sales (or ?from=&to=)
//
// Admin:
//   POST /pos/sales/:id/refund     — refund + re-stock
//
// Notes:
//   - Inventory is backed by Redis (see routes/inventory.js for the
//     documented hack — no Prisma Product model yet).
//   - Sale rows are persisted as Payment rows (type=SUPPLEMENT). The
//     item detail lives in Payment.metadata.items.
//   - For payment_method = CASH or CARD_TERMINAL we mark the Payment
//     APPROVED immediately (charge already happened out of band).
//   - For MP_LINK we create a Mercado Pago preference and return the
//     init_point; the webhook will flip to APPROVED later. Stock is
//     decremented IMMEDIATELY (we reserve it) — on rejection (future
//     webhook) the refund endpoint reverts stock.
// ─────────────────────────────────────────────────────────────────

import { z } from 'zod';
import dayjs from 'dayjs';
import { err } from '../lib/errors.js';
import { fireEvent } from '../lib/events.js';
import { createPreference } from '../lib/mercadopago.js';
import { getItem, adjustStock, listItems } from './inventory.js';
import { generateReceipt } from '../lib/pdf.js';
import { PLAN_CATALOG } from '../lib/memberships.js';

// ─── Schemas ─────────────────────────────────────────────────────
const saleBody = z.object({
    items: z.array(z.object({
        sku: z.string().min(1),
        qty: z.number().int().min(1).max(1000),
    })).min(1),
    user_id: z.string().optional(),      // customer account (optional — walk-in)
    payer_email: z.string().email().optional(), // for MP preference when walk-in
    payment_method: z.enum(['CASH', 'CARD_TERMINAL', 'MP_LINK']),
    notes: z.string().max(500).optional(),
});

const listQuery = z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'REFUNDED', 'CANCELED']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50),
});

// ─── Helpers ─────────────────────────────────────────────────────
function isStaffRole(role) {
    return role === 'RECEPTIONIST' || role === 'TRAINER' || role === 'ADMIN' || role === 'SUPERADMIN';
}

function apiPublicUrl() {
    return process.env.API_PUBLIC_URL || 'http://localhost:3001';
}
function webappPublicUrl() {
    return process.env.WEBAPP_PUBLIC_URL || 'http://localhost:3000';
}

// ─────────────────────────────────────────────────────────────────
export default async function posRoutes(fastify) {
    const { prisma, redis } = fastify;

    // ─── POST /pos/sale ───────────────────────────────────────────
    fastify.post(
        '/pos/sale',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            if (!isStaffRole(req.user.role)) {
                throw err('FORBIDDEN', 'Solo staff puede registrar ventas POS', 403);
            }
            const parsed = saleBody.safeParse(req.body);
            if (!parsed.success) throw err('BAD_BODY', parsed.error.message, 400);
            const body = parsed.data;

            const workspaceId = req.user.workspace_id || fastify.defaultWorkspaceId;
            if (!workspaceId) throw err('NO_WORKSPACE', 'Workspace no resuelto', 400);

            // 1. Resolve items + validate stock upfront (no partial commits).
            const resolved = [];
            for (const it of body.items) {
                const item = await getItem(redis, workspaceId, it.sku);
                if (!item) throw err('SKU_NOT_FOUND', `SKU no encontrado: ${it.sku}`, 404);
                if ((item.stock || 0) < it.qty) {
                    throw err(
                        'INSUFFICIENT_STOCK',
                        `Stock insuficiente para ${it.sku} (disp: ${item.stock}, solicitado: ${it.qty})`,
                        409
                    );
                }
                resolved.push({
                    sku: it.sku,
                    qty: it.qty,
                    name: item.name,
                    unit_price: item.price_mxn,
                    subtotal: item.price_mxn * it.qty,
                });
            }

            const totalMxn = resolved.reduce((sum, r) => sum + r.subtotal, 0);

            // 2. Customer (optional).
            let customer = null;
            if (body.user_id) {
                customer = await prisma.user.findUnique({ where: { id: body.user_id } });
                if (!customer) throw err('USER_NOT_FOUND', 'Cliente no encontrado', 404);
            }

            // 3. Decrement stock (reserves it even for MP_LINK flow).
            const stockRefs = [];
            for (const r of resolved) {
                await adjustStock(redis, workspaceId, r.sku, -r.qty, {
                    actorId: req.user.sub || req.user.id,
                    reason: `pos-sale`,
                    source: 'pos',
                });
                stockRefs.push({ sku: r.sku, qty: r.qty });
            }

            // 4. Create Payment row — APPROVED for CASH/CARD_TERMINAL,
            //    PENDING for MP_LINK.
            const isOffline = body.payment_method === 'CASH' || body.payment_method === 'CARD_TERMINAL';
            const paymentStatus = isOffline ? 'APPROVED' : 'PENDING';

            const payment = await prisma.payment.create({
                data: {
                    workspace_id: workspaceId,
                    user_id: customer ? customer.id : (req.user.sub || req.user.id),
                    amount: totalMxn,
                    type: 'SUPPLEMENT',
                    reference: `POS:${Date.now()}`,
                    description: `POS (${body.payment_method}) · ${resolved.length} item(s)`,
                    status: paymentStatus,
                    paid_at: isOffline ? new Date() : null,
                    metadata: {
                        pos: true,
                        payment_method: body.payment_method,
                        items: resolved,
                        stock_refs: stockRefs,
                        cashier_id: req.user.sub || req.user.id,
                        customer_id: customer?.id || null,
                        notes: body.notes || null,
                    },
                },
            });

            // 5. If MP_LINK, create preference + return init_point for QR.
            let mpPref = null;
            if (body.payment_method === 'MP_LINK') {
                const payerEmail = body.payer_email || customer?.email;
                mpPref = await createPreference({
                    userId: customer?.id || (req.user.sub || req.user.id),
                    type: 'SUPPLEMENT',
                    reference: payment.id,
                    items: resolved.map((r) => ({
                        id: r.sku,
                        title: r.name,
                        quantity: r.qty,
                        unit_price: r.unit_price,
                    })),
                    payer: payerEmail ? { email: payerEmail, name: customer?.full_name || customer?.name } : undefined,
                    back_urls: {
                        success: `${webappPublicUrl()}/pos/success?payment=${payment.id}`,
                        failure: `${webappPublicUrl()}/pos/failed?payment=${payment.id}`,
                        pending: `${webappPublicUrl()}/pos/pending?payment=${payment.id}`,
                    },
                    notification_url: `${apiPublicUrl()}/webhooks/mercadopago`,
                    external_reference: payment.id,
                    metadata: {
                        pos: true,
                        workspace_id: workspaceId,
                    },
                });
                await prisma.payment.update({
                    where: { id: payment.id },
                    data: { mp_preference_id: mpPref.preferenceId },
                });
            }

            // 6. Receipt PDF (fire-and-forget — don't fail sale on PDF error).
            let receipt = null;
            try {
                receipt = await generateReceipt(
                    payment,
                    customer || { email: '—', name: 'Walk-in' },
                    resolved.map((r) => ({
                        description: r.name,
                        qty: r.qty,
                        unit_price: r.unit_price,
                        subtotal: r.subtotal,
                    }))
                );
            } catch (e) {
                fastify.log.warn({ err: e, paymentId: payment.id }, '[pos] receipt generation failed');
            }

            // 7. Event.
            if (isOffline) {
                await fireEvent('pos.sale', {
                    workspaceId,
                    paymentId: payment.id,
                    userId: customer?.id || null,
                    amount: totalMxn,
                    items: resolved,
                    payment_method: body.payment_method,
                });
            }

            return {
                payment,
                total_mxn: totalMxn,
                receipt_url: receipt?.url || null,
                init_point: mpPref?.init_point || null,
                sandbox_init_point: mpPref?.sandbox_init_point || null,
            };
        }
    );

    // ─── GET /pos/sales ───────────────────────────────────────────
    fastify.get(
        '/pos/sales',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            if (!isStaffRole(req.user.role)) {
                throw err('FORBIDDEN', 'Solo staff', 403);
            }
            const parsed = listQuery.safeParse(req.query || {});
            if (!parsed.success) throw err('BAD_QUERY', parsed.error.message, 400);
            const { from, to, status, page, limit } = parsed.data;

            const workspaceId = req.user.workspace_id || fastify.defaultWorkspaceId;
            const where = {
                workspace_id: workspaceId,
                type: 'SUPPLEMENT',
            };
            if (status) where.status = status;

            const defaultFrom = dayjs().startOf('day').toDate();
            where.created_at = {
                gte: from ? new Date(from) : defaultFrom,
            };
            if (to) where.created_at.lte = new Date(to);

            const [total, rows] = await Promise.all([
                prisma.payment.count({ where }),
                prisma.payment.findMany({
                    where,
                    orderBy: { created_at: 'desc' },
                    skip: (page - 1) * limit,
                    take: limit,
                }),
            ]);

            // Summary totals for the shift.
            const totalsAgg = await prisma.payment.aggregate({
                where: { ...where, status: 'APPROVED' },
                _sum: { amount: true },
                _count: { id: true },
            });

            return {
                total,
                page,
                limit,
                pages: Math.max(1, Math.ceil(total / limit)),
                sales: rows,
                summary: {
                    approved_count: totalsAgg._count.id,
                    approved_total_mxn: totalsAgg._sum.amount || 0,
                },
            };
        }
    );

    // ─── GET /pos/products-menu ──────────────────────────────────
    //
    // Unified catalog for the cashier UI. Returns inventory products,
    // membership plan/cycle combos, and published upcoming courses
    // normalized to { type, id, name, price_mxn, ...meta }.
    fastify.get(
        '/pos/products-menu',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            if (!isStaffRole(req.user.role)) {
                throw err('FORBIDDEN', 'Solo staff', 403);
            }
            const workspaceId = req.user.workspace_id || fastify.defaultWorkspaceId;
            if (!workspaceId) throw err('NO_WORKSPACE', 'Workspace no resuelto', 400);

            const [invItems, courseRows] = await Promise.all([
                listItems(redis, workspaceId),
                prisma.course.findMany({
                    where: {
                        workspace_id: workspaceId,
                        published: true,
                        ends_at: { gte: new Date() },
                    },
                    orderBy: { starts_at: 'asc' },
                }),
            ]);

            const products = invItems
                .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                .map((it) => ({
                    type: 'PRODUCT',
                    id: it.sku,
                    sku: it.sku,
                    name: it.name,
                    price_mxn: it.price_mxn,
                    stock: it.stock,
                    category: it.category || null,
                }));

            const memberships = [];
            for (const plan of PLAN_CATALOG) {
                memberships.push(
                    {
                        type: 'MEMBERSHIP',
                        id: `${plan.code}_MONTHLY`,
                        plan: plan.code,
                        billing_cycle: 'MONTHLY',
                        name: `${plan.name} · Mensual`,
                        price_mxn: plan.monthly,
                    },
                    {
                        type: 'MEMBERSHIP',
                        id: `${plan.code}_QUARTERLY`,
                        plan: plan.code,
                        billing_cycle: 'QUARTERLY',
                        name: `${plan.name} · Trimestral`,
                        price_mxn: plan.quarterly,
                    },
                    {
                        type: 'MEMBERSHIP',
                        id: `${plan.code}_ANNUAL`,
                        plan: plan.code,
                        billing_cycle: 'ANNUAL',
                        name: `${plan.name} · Anual`,
                        price_mxn: plan.annual,
                    }
                );
            }

            const courses = courseRows.map((c) => ({
                type: 'COURSE',
                id: c.id,
                name: c.name,
                price_mxn: c.price_mxn,
                sport: c.sport,
                starts_at: c.starts_at,
                ends_at: c.ends_at,
                capacity: c.capacity,
                enrolled: c.enrolled,
                seats_left: Math.max(0, c.capacity - c.enrolled),
            }));

            return { products, memberships, courses };
        }
    );

    // ═════════════════════════════════════════════════════════════
    // Refund — admin only
    // ═════════════════════════════════════════════════════════════
    const adminGuard = {
        preHandler: [fastify.authenticate, fastify.requireRole('ADMIN', 'SUPERADMIN')],
    };

    fastify.post('/pos/sales/:id/refund', adminGuard, async (req) => {
        const paymentId = req.params.id;
        const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
        if (!payment) throw err('PAYMENT_NOT_FOUND', 'Pago no encontrado', 404);
        if (payment.type !== 'SUPPLEMENT') {
            throw err('NOT_POS_SALE', 'Este pago no es una venta POS', 400);
        }
        if (payment.status === 'REFUNDED') {
            throw err('ALREADY_REFUNDED', 'Ya fue reembolsado', 409);
        }

        const meta = payment.metadata || {};
        const items = Array.isArray(meta.items) ? meta.items : [];
        const workspaceId = payment.workspace_id;

        // Re-stock.
        const restocked = [];
        for (const r of items) {
            try {
                await adjustStock(redis, workspaceId, r.sku, Number(r.qty || 0), {
                    actorId: req.user.sub || req.user.id,
                    reason: `pos-refund payment=${paymentId}`,
                    source: 'pos-refund',
                });
                restocked.push({ sku: r.sku, qty: r.qty });
            } catch (e) {
                fastify.log.warn({ err: e, sku: r.sku }, '[pos] restock failed during refund');
            }
        }

        const updated = await prisma.payment.update({
            where: { id: paymentId },
            data: {
                status: 'REFUNDED',
                metadata: {
                    ...(payment.metadata || {}),
                    refunded_at: new Date().toISOString(),
                    refunded_by: req.user.sub || req.user.id,
                    restocked,
                },
            },
        });

        return { payment: updated, restocked };
    });
}
