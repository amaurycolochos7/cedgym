// ─────────────────────────────────────────────────────────────────
// Promo codes.
//
// Authenticated:
//   POST /promocodes/validate     { code, amount, applies_to }
//
// Admin:
//   GET    /admin/promocodes
//   POST   /admin/promocodes
//   PATCH  /admin/promocodes/:id
//   DELETE /admin/promocodes/:id
// ─────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { err } from '../lib/errors.js';
import { applyPromoToAmount } from '../lib/memberships.js';

const validateBody = z.object({
    code: z.string().trim().min(1).max(64),
    amount: z.number().int().positive(),
    applies_to: z.string().optional(),
});

const createBody = z.object({
    code: z.string().trim().min(3).max(64),
    type: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']),
    value: z.number().int().positive(),
    applies_to: z.array(z.string()).default([]),
    max_uses: z.number().int().positive().optional(),
    expires_at: z.string().optional(),
    min_amount_mxn: z.number().int().positive().optional(),
    enabled: z.boolean().default(true),
});

const patchBody = createBody.partial();

export default async function promocodesRoutes(fastify) {
    const { prisma } = fastify;

    // ─── POST /promocodes/validate ────────────────────────────────
    fastify.post(
        '/promocodes/validate',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const parsed = validateBody.safeParse(req.body);
            if (!parsed.success) {
                throw err('BAD_BODY', parsed.error.message, 400);
            }
            const { code, amount, applies_to } = parsed.data;
            const promo = await prisma.promoCode.findUnique({ where: { code } });
            const res = applyPromoToAmount(promo, amount, applies_to);
            return {
                valid: res.valid,
                reason: res.reason || null,
                discount_mxn: res.discount_mxn,
                final_amount: res.final_amount,
                promo: res.valid
                    ? { code: promo.code, type: promo.type, value: promo.value }
                    : null,
            };
        }
    );

    // ─── GET /admin/promocodes ────────────────────────────────────
    fastify.get(
        '/admin/promocodes',
        { preHandler: [fastify.authenticate, fastify.requireRole('ADMIN', 'SUPERADMIN')] },
        async () => {
            const codes = await prisma.promoCode.findMany({
                orderBy: { created_at: 'desc' },
                take: 500,
            });
            return { promocodes: codes };
        }
    );

    // ─── POST /admin/promocodes ───────────────────────────────────
    fastify.post(
        '/admin/promocodes',
        { preHandler: [fastify.authenticate, fastify.requireRole('ADMIN', 'SUPERADMIN')] },
        async (req) => {
            const parsed = createBody.safeParse(req.body);
            if (!parsed.success) {
                throw err('BAD_BODY', parsed.error.message, 400);
            }
            const data = { ...parsed.data };
            if (data.expires_at) data.expires_at = new Date(data.expires_at);

            // workspace_id is required on the model; we grab it off the
            // caller's JWT. (If the admin token somehow lacks it, we
            // error out clearly rather than silently mis-attributing.)
            const workspaceId = req.user.workspace_id || req.user.workspaceId;
            if (!workspaceId) {
                throw err('NO_WORKSPACE', 'Token sin workspace_id', 400);
            }

            const promo = await prisma.promoCode.create({
                data: { ...data, workspace_id: workspaceId },
            });
            return { promo };
        }
    );

    // ─── PATCH /admin/promocodes/:id ──────────────────────────────
    fastify.patch(
        '/admin/promocodes/:id',
        { preHandler: [fastify.authenticate, fastify.requireRole('ADMIN', 'SUPERADMIN')] },
        async (req) => {
            const parsed = patchBody.safeParse(req.body || {});
            if (!parsed.success) {
                throw err('BAD_BODY', parsed.error.message, 400);
            }
            const data = { ...parsed.data };
            if (data.expires_at) data.expires_at = new Date(data.expires_at);

            const promo = await prisma.promoCode.update({
                where: { id: req.params.id },
                data,
            });
            return { promo };
        }
    );

    // ─── DELETE /admin/promocodes/:id ─────────────────────────────
    fastify.delete(
        '/admin/promocodes/:id',
        { preHandler: [fastify.authenticate, fastify.requireRole('ADMIN', 'SUPERADMIN')] },
        async (req) => {
            await prisma.promoCode.delete({ where: { id: req.params.id } });
            return { deleted: true };
        }
    );
}
