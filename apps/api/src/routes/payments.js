// ─────────────────────────────────────────────────────────────────
// Payments.
//
// Authenticated:
//   GET /payments/me         — own paginated list
//   GET /payments/:id        — only the owner or an admin
//
// Admin:
//   GET /admin/payments      — filters + CSV export (?format=csv)
// ─────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { err } from '../lib/errors.js';
import { audit, auditCtx } from '../lib/audit.js';
import {
    assertWorkspaceAccess,
    assertOwnerOrWorkspaceRole,
} from '../lib/tenant-guard.js';

const meQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    type: z.enum(['MEMBERSHIP', 'COURSE', 'DIGITAL_PRODUCT', 'SUPPLEMENT', 'OTHER']).optional(),
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'REFUNDED', 'CANCELED']).optional(),
});

const adminQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(500).default(50),
    type: z
        .enum([
            'MEMBERSHIP',
            'COURSE',
            'DIGITAL_PRODUCT',
            'SUPPLEMENT',
            'MEAL_PLAN_ADDON',
            'OTHER',
        ])
        .optional(),
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'REFUNDED', 'CANCELED']).optional(),
    user_id: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    format: z.enum(['json', 'csv']).default('json'),
});

// Normalize a Payment row (Prisma) + optional User relation into the
// shape the admin UI expects. The raw Prisma column is `amount` but the
// admin interface reads `amount_mxn`; `method` lives inside `metadata`
// depending on the flow (card_brick, promo_100, cash, transfer). This
// keeps the admin table bug-free even as new payment flows are added.
function mapAdminPayment(row) {
    const meta = row.metadata || {};

    // Best-effort method resolution:
    //   • explicit override in metadata.method wins (manual assignments).
    //   • then MP's returned `payment_method_id` (visa / master / amex / oxxo…).
    //   • then our own flow markers (courtesy / admin-assign / cash).
    let method = meta.method || meta.payment_method || meta.mp_payment_method || null;
    if (!method && meta.bypass === 'promo_100') method = 'COURTESY_PROMO';
    if (!method && meta.flow === 'card_brick') method = 'CARD';
    if (!method && meta.admin_assigned) method = meta.method || 'CASH';

    // User label — prefer full_name, fall back to name or email.
    const user = row.user || null;
    const userName = user
        ? user.full_name || user.name || user.email || null
        : null;

    return {
        id: row.id,
        user_id: row.user_id,
        user_name: userName,
        type: row.type,
        status: row.status,
        amount_mxn: row.amount,
        base_amount_mxn:
            typeof meta.base_price === 'number' ? meta.base_price : null,
        discount_mxn:
            typeof meta.discount_mxn === 'number' && meta.discount_mxn > 0
                ? meta.discount_mxn
                : null,
        promo_code: meta.promo_code || null,
        method,
        mp_payment_id: row.mp_payment_id || null,
        mp_status_detail: row.mp_status_detail || null,
        reference: row.reference || null,
        description: row.description || null,
        paid_at: row.paid_at ? row.paid_at.toISOString() : null,
        created_at: row.created_at ? row.created_at.toISOString() : null,
    };
}

function isAdminRole(role) {
    return role === 'ADMIN' || role === 'SUPERADMIN';
}

// RFC-4180-ish CSV escape.
function csvEscape(v) {
    if (v == null) return '';
    const s = String(v);
    if (/[",\n\r]/.test(s)) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

function paymentsToCsv(rows) {
    const header = [
        'id',
        'created_at',
        'user_id',
        'type',
        'amount',
        'status',
        'reference',
        'mp_payment_id',
        'paid_at',
    ];
    const lines = [header.join(',')];
    for (const p of rows) {
        lines.push(
            [
                p.id,
                p.created_at?.toISOString() || '',
                p.user_id,
                p.type,
                p.amount,
                p.status,
                p.reference || '',
                p.mp_payment_id || '',
                p.paid_at ? p.paid_at.toISOString() : '',
            ]
                .map(csvEscape)
                .join(',')
        );
    }
    return lines.join('\n');
}

export default async function paymentsRoutes(fastify) {
    const { prisma } = fastify;

    // ─── GET /payments/me ─────────────────────────────────────────
    fastify.get(
        '/payments/me',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const parsed = meQuery.safeParse(req.query || {});
            if (!parsed.success) throw err('BAD_QUERY', parsed.error.message, 400);
            const { page, limit, type, status } = parsed.data;
            const userId = req.user.sub || req.user.id;

            const where = { user_id: userId };
            if (type) where.type = type;
            if (status) where.status = status;

            const [total, rows] = await Promise.all([
                prisma.payment.count({ where }),
                prisma.payment.findMany({
                    where,
                    orderBy: { created_at: 'desc' },
                    skip: (page - 1) * limit,
                    take: limit,
                }),
            ]);

            return {
                total,
                page,
                limit,
                pages: Math.max(1, Math.ceil(total / limit)),
                payments: rows,
            };
        }
    );

    // ─── GET /payments/:id ────────────────────────────────────────
    // Authorization: owner OR (admin/superadmin in the SAME workspace).
    // Cross-tenant admin access is rejected as 404 to hide existence.
    fastify.get(
        '/payments/:id',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const payment = await prisma.payment.findUnique({
                where: { id: req.params.id },
            });
            if (!payment) {
                throw err('PAYMENT_NOT_FOUND', 'Pago no encontrado', 404);
            }
            const accessMode = assertOwnerOrWorkspaceRole(req, payment); // throws 403/404
            // Audit only when staff reads someone else's payment.
            if (accessMode === 'staff') {
                audit(fastify, {
                    workspace_id: payment.workspace_id,
                    actor_id: req.user?.sub || req.user?.id || null,
                    action: 'payment.viewed',
                    target_type: 'payment',
                    target_id: payment.id,
                    metadata: { user_id: payment.user_id, amount: payment.amount },
                    ...auditCtx(req),
                });
            }
            return { payment };
        }
    );

    // ─── GET /admin/payments ──────────────────────────────────────
    fastify.get(
        '/admin/payments',
        { preHandler: [fastify.authenticate, fastify.requireRole('ADMIN', 'SUPERADMIN')] },
        async (req, reply) => {
            const workspaceId = assertWorkspaceAccess(req);
            const parsed = adminQuery.safeParse(req.query || {});
            if (!parsed.success) throw err('BAD_QUERY', parsed.error.message, 400);
            const { page, limit, type, status, user_id, from, to, format } = parsed.data;

            // Workspace scoping is non-negotiable. Every payment listing is
            // limited to the actor's own workspace.
            const where = { workspace_id: workspaceId };
            if (type) where.type = type;
            if (status) where.status = status;
            if (user_id) where.user_id = user_id;
            if (from || to) {
                where.created_at = {};
                if (from) where.created_at.gte = new Date(from);
                if (to) where.created_at.lte = new Date(to);
            }

            if (format === 'csv') {
                // Single-shot fetch (cap to 10 000 — bigger exports should
                // go through a background job, out of scope here).
                const rows = await prisma.payment.findMany({
                    where,
                    orderBy: { created_at: 'desc' },
                    take: 10000,
                });
                audit(fastify, {
                    workspace_id: workspaceId,
                    actor_id: req.user?.sub || req.user?.id || null,
                    action: 'payments.exported_csv',
                    target_type: 'report',
                    metadata: {
                        row_count: rows.length,
                        filters: { type, status, user_id, from, to },
                    },
                    ...auditCtx(req),
                });
                reply.header('content-type', 'text/csv; charset=utf-8');
                reply.header(
                    'content-disposition',
                    `attachment; filename="payments-${Date.now()}.csv"`
                );
                return paymentsToCsv(rows);
            }

            const [total, rows] = await Promise.all([
                prisma.payment.count({ where }),
                prisma.payment.findMany({
                    where,
                    orderBy: { created_at: 'desc' },
                    skip: (page - 1) * limit,
                    take: limit,
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                full_name: true,
                                email: true,
                            },
                        },
                    },
                }),
            ]);

            return {
                total,
                page,
                limit,
                pages: Math.max(1, Math.ceil(total / limit)),
                payments: rows.map(mapAdminPayment),
            };
        }
    );

    // ─── POST /admin/payments/_seed_demo ──────────────────────────
    //
    // Admin helper — seeds 4 demo Payment rows so the admin can
    // preview how the list renders for each payment flavor:
    //   1. Full-price card payment (no discount)
    //   2. Card payment + partial promo code (20% off)
    //   3. 100%-off promo activation (zero-amount courtesy flow)
    //   4. Meal-plan add-on purchase with a 15% promo
    //
    // Rows are tagged with metadata.demo = true and reference =
    // 'DEMO:*' so they're easy to spot / bulk-delete later. User
    // resolves to the caller (admin's own id) so foreign keys hold.
    fastify.post(
        '/admin/payments/_seed_demo',
        { preHandler: [fastify.authenticate, fastify.requireRole('ADMIN', 'SUPERADMIN')] },
        async (req) => {
            const userId = req.user.sub || req.user.id;
            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user) throw err('USER_NOT_FOUND', 'Usuario no encontrado', 404);

            const workspaceId = user.workspace_id;
            const nowISO = new Date();
            const minutesAgo = (m) => new Date(nowISO.getTime() - m * 60_000);

            // Clean up previous demo rows so re-running the seed
            // doesn't pile up duplicates. Harmless no-op on a fresh db.
            await prisma.payment.deleteMany({
                where: {
                    workspace_id: workspaceId,
                    metadata: { path: ['demo'], equals: true },
                },
            });

            const demoRows = [
                {
                    id: undefined,
                    workspace_id: workspaceId,
                    user_id: user.id,
                    type: 'MEMBERSHIP',
                    amount: 999,
                    status: 'APPROVED',
                    reference: 'DEMO:PRO:MONTHLY',
                    description: 'Membresía Pro — Mensual',
                    mp_payment_id: 'DEMO-MP-101',
                    paid_at: minutesAgo(5),
                    created_at: minutesAgo(5),
                    metadata: {
                        demo: true,
                        plan: 'PRO',
                        billing_cycle: 'MONTHLY',
                        base_price: 999,
                        discount_mxn: 0,
                        flow: 'card_brick',
                        mp_payment_method: 'visa',
                        mp_installments: 1,
                    },
                },
                {
                    id: undefined,
                    workspace_id: workspaceId,
                    user_id: user.id,
                    type: 'MEMBERSHIP',
                    amount: 799, // 999 - 20%
                    status: 'APPROVED',
                    reference: 'DEMO:PRO:MONTHLY:PROMO20',
                    description: 'Membresía Pro — Mensual (promo PROMO20)',
                    mp_payment_id: 'DEMO-MP-102',
                    paid_at: minutesAgo(10),
                    created_at: minutesAgo(10),
                    metadata: {
                        demo: true,
                        plan: 'PRO',
                        billing_cycle: 'MONTHLY',
                        base_price: 999,
                        discount_mxn: 200,
                        promo_code: 'PROMO20',
                        flow: 'card_brick',
                        mp_payment_method: 'master',
                        mp_installments: 3,
                    },
                },
                {
                    id: undefined,
                    workspace_id: workspaceId,
                    user_id: user.id,
                    type: 'MEMBERSHIP',
                    amount: 0,
                    status: 'APPROVED',
                    reference: 'DEMO:ELITE:MONTHLY:FREE100',
                    description: 'Membresía Élite — Mensual (código 100% OFF)',
                    mp_payment_id: null,
                    paid_at: minutesAgo(15),
                    created_at: minutesAgo(15),
                    metadata: {
                        demo: true,
                        plan: 'ELITE',
                        billing_cycle: 'MONTHLY',
                        base_price: 1590,
                        discount_mxn: 1590,
                        promo_code: 'CORTESIA',
                        bypass: 'promo_100',
                        payment_method: 'COMPLIMENTARY',
                    },
                },
                {
                    id: undefined,
                    workspace_id: workspaceId,
                    user_id: user.id,
                    type: 'MEAL_PLAN_ADDON',
                    amount: 424, // 499 - 15%
                    status: 'APPROVED',
                    reference: 'DEMO:MEAL_PLAN_ADDON:PROMO15',
                    description: 'Add-on plan alimenticio (promo NUTRI15)',
                    mp_payment_id: 'DEMO-MP-104',
                    paid_at: minutesAgo(20),
                    created_at: minutesAgo(20),
                    metadata: {
                        demo: true,
                        addon_kind: 'MEAL_PLAN_ADDON',
                        base_price: 499,
                        discount_mxn: 75,
                        promo_code: 'NUTRI15',
                        flow: 'card_brick',
                        mp_payment_method: 'amex',
                        mp_installments: 1,
                    },
                },
            ];

            const created = await Promise.all(
                demoRows.map((r) => prisma.payment.create({ data: r })),
            );
            return { created: created.length };
        },
    );
}
