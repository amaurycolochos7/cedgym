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

const meQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    type: z.enum(['MEMBERSHIP', 'COURSE', 'DIGITAL_PRODUCT', 'SUPPLEMENT', 'OTHER']).optional(),
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'REFUNDED', 'CANCELED']).optional(),
});

const adminQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(500).default(50),
    type: z.enum(['MEMBERSHIP', 'COURSE', 'DIGITAL_PRODUCT', 'SUPPLEMENT', 'OTHER']).optional(),
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'REFUNDED', 'CANCELED']).optional(),
    user_id: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    format: z.enum(['json', 'csv']).default('json'),
});

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
    fastify.get(
        '/payments/:id',
        { preHandler: [fastify.authenticate] },
        async (req, reply) => {
            const payment = await prisma.payment.findUnique({
                where: { id: req.params.id },
            });
            if (!payment) {
                throw err('PAYMENT_NOT_FOUND', 'Pago no encontrado', 404);
            }
            const userId = req.user.sub || req.user.id;
            if (payment.user_id !== userId && !isAdminRole(req.user.role)) {
                throw err('FORBIDDEN', 'No autorizado', 403);
            }
            return { payment };
        }
    );

    // ─── GET /admin/payments ──────────────────────────────────────
    fastify.get(
        '/admin/payments',
        { preHandler: [fastify.authenticate, fastify.requireRole('ADMIN', 'SUPERADMIN')] },
        async (req, reply) => {
            const parsed = adminQuery.safeParse(req.query || {});
            if (!parsed.success) throw err('BAD_QUERY', parsed.error.message, 400);
            const { page, limit, type, status, user_id, from, to, format } = parsed.data;

            const where = {};
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
                payments: rows,
            };
        }
    );
}
