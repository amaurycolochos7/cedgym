// ─────────────────────────────────────────────────────────────────
// Promo codes.
//
// Authenticated:
//   POST /promocodes/validate     { code, (amount|amount_mxn), applies_to? }
//     → { valid, reason, discount_mxn, final_amount,
//         final_amount_mxn_preview, discount_type, value, promo }
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

// `amount` is kept for backwards compatibility with early callers;
// new code should pass `amount_mxn` (same type/semantics) so the
// request body matches the rest of the membership endpoints. At
// least one of the two must be present and positive.
const validateBody = z
    .object({
        code: z.string().trim().min(1).max(64),
        amount: z.number().int().positive().optional(),
        amount_mxn: z.number().int().positive().optional(),
        applies_to: z.string().optional(),
    })
    .refine((d) => d.amount != null || d.amount_mxn != null, {
        message: 'amount or amount_mxn is required',
        path: ['amount'],
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
            const { code, applies_to } = parsed.data;
            // Accept either `amount` (legacy) or `amount_mxn` (preferred).
            const amountMxn = parsed.data.amount_mxn ?? parsed.data.amount;
            const promo = await prisma.promoCode.findUnique({ where: { code } });
            const res = applyPromoToAmount(promo, amountMxn, applies_to);
            // Return shape is additive: we keep the legacy fields
            // (`discount_mxn`, `final_amount`, `promo`) for older
            // frontends and add `discount_type` + `value` +
            // `final_amount_mxn_preview` so the new modal can render
            // "Ahorras $X" before attempting the charge. When the
            // promo is invalid we still return `final_amount_mxn_preview`
            // equal to the input amount so the UI can show the full
            // price without a null-check.
            return {
                valid: res.valid,
                reason: res.reason || null,
                discount_mxn: res.discount_mxn,
                final_amount: res.final_amount,
                final_amount_mxn_preview: res.final_amount,
                discount_type: res.valid ? promo.type : null,
                value: res.valid ? promo.value : null,
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
