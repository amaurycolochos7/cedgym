// ─────────────────────────────────────────────────────────────────
// Add-ons.
//
// Currently ships ONE add-on: a $499 MXN one-time purchase that
// unlocks a single AI meal plan generation for users whose plan
// (STARTER) doesn't include that feature, or who have already
// burned their PRO monthly quota.
//
// Endpoints:
//   GET  /addons/meal-plan/price            (auth) — current price
//   GET  /addons/meal-plan/me               (auth) — active addon + history
//   POST /addons/meal-plan/purchase-card    (auth) — Payment Bricks purchase
//
// Pattern mirrors POST /memberships/subscribe-card 1:1: same
// promo-code resolution, same Mercado Pago Brick flow, same
// 100%-off bypass, same activation helper from webhooks.js.
// ─────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { err } from '../lib/errors.js';
import { fireEvent } from '../lib/events.js';
import { audit, auditCtx } from '../lib/audit.js';
import { applyPromoToAmount } from '../lib/memberships.js';
import {
    createCardPayment,
    mapPaymentStatus,
} from '../lib/mercadopago.js';
import { SETTING_KEYS, getWorkspaceSetting, setWorkspaceSetting } from '../lib/settings.js';
import { activateMealPlanAddonFromPayment } from './webhooks.js';

// Default price used when no admin override is set. Admins can
// change the effective price via PATCH /admin/addons/meal-plan/price
// which writes to workspace_settings[meal_plan_addon.price_mxn].
const MEAL_PLAN_ADDON_DEFAULT_PRICE_MXN = 499;

// Resolve the currently-effective addon price for `workspaceId`,
// falling back to the default when no override exists.
async function resolveAddonPrice(prisma, workspaceId) {
    if (!workspaceId) return MEAL_PLAN_ADDON_DEFAULT_PRICE_MXN;
    try {
        const v = await getWorkspaceSetting(
            prisma,
            workspaceId,
            SETTING_KEYS.MEAL_PLAN_ADDON_PRICE,
            null,
        );
        if (typeof v === 'number' && v >= 0) return v;
        return MEAL_PLAN_ADDON_DEFAULT_PRICE_MXN;
    } catch {
        return MEAL_PLAN_ADDON_DEFAULT_PRICE_MXN;
    }
}

const ACTIVE_MEMBERSHIP_STATUSES = new Set(['ACTIVE', 'TRIAL']);

const purchaseCardBody = z.object({
    token: z.string().min(8),
    payment_method_id: z.string().min(1).max(32),
    installments: z.number().int().min(1).max(12).default(1),
    payer_email: z.string().email().optional(),
    promo_code: z.string().trim().min(1).max(64).optional(),
});

// ── Helpers ──────────────────────────────────────────────────────

// Mirror /memberships/subscribe-card's resolvePromo so the discount
// math is identical for both flows. Throws via err() on invalid.
async function resolvePromo(prisma, promoCode, basePrice, appliesTo) {
    if (!promoCode) {
        return { amount: basePrice, discount: 0, promo: null };
    }
    const found = await prisma.promoCode.findUnique({
        where: { code: promoCode },
    });
    const res = applyPromoToAmount(found, basePrice, appliesTo);
    if (!res.valid) {
        throw err('PROMO_INVALID', `Promo inválido: ${res.reason}`, 400);
    }
    return {
        amount: res.final_amount,
        discount: res.discount_mxn,
        promo: res.promo,
    };
}

// True iff the user has a usable membership (ACTIVE/TRIAL and not past expiry).
async function hasActiveMembership(prisma, userId) {
    const m = await prisma.membership.findUnique({
        where: { user_id: userId },
        select: { status: true, expires_at: true },
    });
    if (!m) return false;
    if (!ACTIVE_MEMBERSHIP_STATUSES.has(m.status)) return false;
    if (m.expires_at && new Date(m.expires_at).getTime() < Date.now()) return false;
    return true;
}

const welcomeCopy = {
    title: '¡Add-on activado!',
    benefits: ['1 plan alimenticio personalizado con IA'],
};

// ─────────────────────────────────────────────────────────────────
export default async function addonsRoutes(fastify) {
    const { prisma } = fastify;

    // ─── GET /addons/meal-plan/price ─────────────────────────────
    // Authenticated but no role check — every member in the portal
    // needs to know the current price to render the upgrade banner
    // and the modal total. Pulls the admin-editable override first
    // and falls back to the hardcoded default.
    fastify.get(
        '/addons/meal-plan/price',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const workspaceId = req.user.workspace_id || fastify.defaultWorkspaceId;
            const priceMxn = await resolveAddonPrice(prisma, workspaceId);
            return { price_mxn: priceMxn, currency: 'MXN' };
        }
    );

    // ─── PATCH /admin/addons/meal-plan/price ─────────────────────
    // Admin-only. Persists the new effective price in
    // `workspace_settings[meal_plan_addon.price_mxn]`. Bumping this
    // immediately affects:
    //   • GET /addons/meal-plan/price (modal + portal banner)
    //   • POST /addons/meal-plan/purchase-card (charge amount)
    const addonPriceBody = z.object({
        price_mxn: z.number().int().min(0).max(1_000_000),
    });

    fastify.patch(
        '/admin/addons/meal-plan/price',
        {
            preHandler: [
                fastify.authenticate,
                fastify.requireRole('ADMIN', 'SUPERADMIN'),
            ],
        },
        async (req) => {
            const parsed = addonPriceBody.safeParse(req.body);
            if (!parsed.success) {
                throw err('BAD_BODY', parsed.error.message, 400);
            }
            const { price_mxn } = parsed.data;

            const workspaceId = req.user.workspace_id || fastify.defaultWorkspaceId;
            if (!workspaceId) {
                throw err('WORKSPACE_MISSING', 'No se pudo resolver el workspace', 500);
            }

            await setWorkspaceSetting(
                prisma,
                workspaceId,
                SETTING_KEYS.MEAL_PLAN_ADDON_PRICE,
                price_mxn,
                req.user.sub || req.user.id || null,
            );

            try {
                await audit(prisma, {
                    ...auditCtx(req),
                    action: 'ADMIN.ADDON_PRICE_UPDATED',
                    entity_type: 'MealPlanAddon',
                    entity_id: 'default',
                    metadata: { price_mxn },
                });
            } catch {
                /* best-effort */
            }

            return { success: true, price_mxn, currency: 'MXN' };
        },
    );

    // ─── GET /admin/addons/meal-plan/price ───────────────────────
    // Admin-only helper so the admin UI hydrates the "current
    // price" card without having to reuse the auth'd member endpoint.
    fastify.get(
        '/admin/addons/meal-plan/price',
        {
            preHandler: [
                fastify.authenticate,
                fastify.requireRole('ADMIN', 'SUPERADMIN'),
            ],
        },
        async (req) => {
            const workspaceId = req.user.workspace_id || fastify.defaultWorkspaceId;
            const priceMxn = await resolveAddonPrice(prisma, workspaceId);
            return {
                price_mxn: priceMxn,
                default_price_mxn: MEAL_PLAN_ADDON_DEFAULT_PRICE_MXN,
                currency: 'MXN',
            };
        },
    );

    // ─── GET /addons/meal-plan/me ────────────────────────────────
    // Returns the user's currently-purchased-but-not-yet-consumed
    // addon (if any) and the last 50 addons in their history. The
    // frontend uses `active` to render "ya tienes uno listo" before
    // attempting another purchase.
    fastify.get(
        '/addons/meal-plan/me',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const userId = req.user.sub || req.user.id;
            const [active, history] = await Promise.all([
                prisma.mealPlanAddon.findFirst({
                    where: { user_id: userId, status: 'ACTIVE' },
                    orderBy: { activated_at: 'desc' },
                }),
                prisma.mealPlanAddon.findMany({
                    where: { user_id: userId },
                    orderBy: { created_at: 'desc' },
                    take: 50,
                }),
            ]);
            return { active, history };
        }
    );

    // ─── POST /addons/meal-plan/purchase-card ────────────────────
    //
    // Embedded MP Payment Bricks flow. Mirrors
    // POST /memberships/subscribe-card almost exactly; the only
    // intentional differences are:
    //   - no selfie gate (this is a paid feature unlock, not a
    //     gym entry credential, so no need to identify the user
    //     at the front desk)
    //   - elegibility guard requires an ACTIVE/TRIAL membership
    //     (the addon extends a feature that ONLY makes sense
    //     while the gym subscription is live)
    //   - anti-stacking guard: refuse if the user already has an
    //     ACTIVE non-consumed addon (so a double-click doesn't
    //     burn $998).
    //
    fastify.post(
        '/addons/meal-plan/purchase-card',
        {
            preHandler: [
                fastify.authenticate,
                fastify.requireRole(
                    'ATHLETE',
                    'TRAINER',
                    'RECEPTIONIST',
                    'ADMIN',
                    'SUPERADMIN'
                ),
            ],
        },
        async (req, reply) => {
            const parsed = purchaseCardBody.safeParse(req.body);
            if (!parsed.success) {
                throw err('BAD_BODY', parsed.error.message, 400);
            }
            const {
                token,
                payment_method_id,
                installments,
                payer_email,
                promo_code,
            } = parsed.data;

            const userId = req.user.sub || req.user.id;
            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user) throw err('USER_NOT_FOUND', 'Usuario inexistente', 404);

            // Membership gate — the addon only makes sense layered on
            // top of an active gym membership. If the user has no
            // membership we send them to /memberships first.
            const membershipOk = await hasActiveMembership(prisma, user.id);
            if (!membershipOk) {
                throw err(
                    'MEMBERSHIP_REQUIRED',
                    'Necesitas una membresía activa para comprar el add-on.',
                    403
                );
            }

            // Anti-stacking — if there's already an ACTIVE addon waiting
            // to be consumed, refuse. CONSUMED addons are fine; that just
            // means they used a previous one and want another.
            const alreadyActive = await prisma.mealPlanAddon.findFirst({
                where: { user_id: user.id, status: 'ACTIVE' },
                select: { id: true },
            });
            if (alreadyActive) {
                throw err(
                    'ADDON_ALREADY_ACTIVE',
                    'Ya tienes un add-on de plan alimenticio activo sin usar.',
                    409
                );
            }

            const basePrice = await resolveAddonPrice(prisma, user.workspace_id);
            const { amount, discount, promo } = await resolvePromo(
                prisma,
                promo_code,
                basePrice,
                'MEAL_PLAN_ADDON'
            );

            const description = 'Add-on plan alimenticio IA';
            const effectivePayerEmail = payer_email || user.email || undefined;

            // 1) Create the local PENDING Payment first so we can use
            // its id as MP's external_reference.
            const payment = await prisma.payment.create({
                data: {
                    workspace_id: user.workspace_id,
                    user_id: user.id,
                    amount,
                    type: 'MEAL_PLAN_ADDON',
                    reference: 'MEAL_PLAN_ADDON',
                    description,
                    status: 'PENDING',
                    metadata: {
                        addon_kind: 'MEAL_PLAN_ADDON',
                        base_price: basePrice,
                        discount_mxn: discount,
                        promo_code: promo?.code || null,
                        promo_id: promo?.id || null,
                        flow: 'card_brick',
                        payment_method_id,
                        installments,
                    },
                },
            });

            // 2) Create the matching addon row in PENDING. Linking by
            // payment_id (unique) guarantees the webhook can find it
            // by the same external_reference path memberships use.
            const addon = await prisma.mealPlanAddon.create({
                data: {
                    workspace_id: user.workspace_id,
                    user_id: user.id,
                    payment_id: payment.id,
                    price_mxn: basePrice,
                    paid_mxn: amount,
                    promo_code_id: promo?.id || null,
                    status: 'PENDING',
                },
            });

            // 2.5) Promo 100% bypass — same logic as memberships:
            // a courtesy / test code that wipes the whole price means
            // we never call MP. Mark Payment APPROVED, fire the
            // activation helper, dispatch payment.approved so the
            // automation worker (welcome message etc.) still runs.
            if (amount === 0) {
                const approvedPayment = await prisma.payment.update({
                    where: { id: payment.id },
                    data: {
                        status: 'APPROVED',
                        paid_at: new Date(),
                        metadata: {
                            ...(payment.metadata || {}),
                            bypass: 'promo_100',
                            promo_code: promo?.code || null,
                            payment_method: 'COMPLIMENTARY',
                        },
                    },
                });

                try {
                    await activateMealPlanAddonFromPayment(fastify, approvedPayment);
                } catch (e) {
                    req.log.error(
                        { err: e, paymentId: approvedPayment.id },
                        '[addons/meal-plan] promo_100 activation failed'
                    );
                }

                try {
                    await fireEvent('payment.approved', {
                        workspaceId: approvedPayment.workspace_id,
                        paymentId: approvedPayment.id,
                        userId: approvedPayment.user_id,
                        type: approvedPayment.type,
                        amount: approvedPayment.amount,
                    });
                } catch (e) {
                    req.log.warn(
                        { err: e, paymentId: approvedPayment.id },
                        '[addons/meal-plan] payment.approved event failed'
                    );
                }

                const refreshed = await prisma.mealPlanAddon.findUnique({
                    where: { id: addon.id },
                });

                return {
                    success: true,
                    payment: {
                        id: approvedPayment.id,
                        amount: approvedPayment.amount,
                        status: approvedPayment.status,
                        mp_payment_id: null,
                        discount_mxn: discount,
                    },
                    addon: { id: refreshed.id, status: refreshed.status },
                    welcome: welcomeCopy,
                };
            }

            // 3) Charge MP via the Brick token.
            let mpResp;
            try {
                mpResp = await createCardPayment({
                    transaction_amount: amount,
                    token,
                    payment_method_id,
                    installments,
                    payer_email: effectivePayerEmail,
                    description,
                    external_reference: payment.id,
                    metadata: {
                        addon_kind: 'MEAL_PLAN_ADDON',
                        workspace_id: user.workspace_id,
                        user_id: user.id,
                    },
                });
            } catch (e) {
                req.log.error(
                    { err: e, paymentId: payment.id },
                    '[addons/meal-plan] MP createCardPayment failed'
                );
                await prisma.payment.update({
                    where: { id: payment.id },
                    data: {
                        status: 'REJECTED',
                        mp_status_detail: 'mp_sdk_error',
                        metadata: {
                            ...(payment.metadata || {}),
                            mp_error: e?.message || 'unknown',
                        },
                    },
                });
                // Mark the addon as REFUNDED-equivalent — keep PENDING
                // would ghost in the user's "active" lookup. We use
                // EXPIRED to mean "never made it to ACTIVE".
                await prisma.mealPlanAddon.update({
                    where: { id: addon.id },
                    data: { status: 'EXPIRED' },
                });
                throw err(
                    'MP_ERROR',
                    'No se pudo procesar el pago con Mercado Pago. Intenta de nuevo.',
                    502
                );
            }

            const mpStatus = mpResp?.status || 'rejected';
            const newStatus = mapPaymentStatus(mpStatus);

            // 4) Update the local Payment with the MP result.
            const updatedPayment = await prisma.payment.update({
                where: { id: payment.id },
                data: {
                    mp_payment_id: mpResp?.id ? String(mpResp.id) : null,
                    status: newStatus,
                    mp_status_detail: mpResp?.status_detail || null,
                    paid_at:
                        newStatus === 'APPROVED'
                            ? new Date(mpResp?.date_approved || Date.now())
                            : null,
                    metadata: {
                        ...(payment.metadata || {}),
                        mp_status: mpStatus,
                        mp_status_detail: mpResp?.status_detail || null,
                        mp_payment_method: mpResp?.payment_method_id || payment_method_id,
                        mp_payment_type: mpResp?.payment_type_id || null,
                        mp_installments: mpResp?.installments || installments,
                    },
                },
            });

            // 5) Approved → activate synchronously. The webhook will
            // also re-fire later; activation is idempotent.
            if (newStatus === 'APPROVED') {
                try {
                    await activateMealPlanAddonFromPayment(fastify, updatedPayment);
                } catch (e) {
                    req.log.error(
                        { err: e, paymentId: updatedPayment.id },
                        '[addons/meal-plan] activateMealPlanAddonFromPayment failed'
                    );
                }

                if (promo?.id) {
                    try {
                        await prisma.promoCode.update({
                            where: { id: promo.id },
                            data: { used_count: { increment: 1 } },
                        });
                    } catch (e) {
                        req.log.warn(
                            { err: e, promoId: promo.id },
                            '[addons/meal-plan] promo used_count bump failed'
                        );
                    }
                }

                const refreshed = await prisma.mealPlanAddon.findUnique({
                    where: { id: addon.id },
                });

                return {
                    success: true,
                    payment: {
                        id: updatedPayment.id,
                        amount: updatedPayment.amount,
                        status: updatedPayment.status,
                        mp_payment_id: updatedPayment.mp_payment_id,
                        discount_mxn: discount,
                    },
                    addon: { id: refreshed.id, status: refreshed.status },
                    welcome: welcomeCopy,
                };
            }

            // 6) Rejected / cancelled / in_process → 402 retry-able.
            // We leave the addon in PENDING; the webhook will resolve
            // it (to ACTIVE on a delayed approval, or it'll just sit
            // there and the user can try again with a new payment).
            if (mpStatus === 'rejected' || mpStatus === 'cancelled') {
                return reply.code(402).send({
                    error: {
                        code: 'PAYMENT_DECLINED',
                        message:
                            mpResp?.status_detail ||
                            'El pago fue rechazado por el emisor. Verifica los datos o usa otra tarjeta.',
                        retry_allowed: true,
                    },
                    statusCode: 402,
                });
            }

            return reply.code(402).send({
                error: {
                    code: 'PAYMENT_DECLINED',
                    message:
                        mpResp?.status_detail ||
                        'Tu pago quedó en revisión. Recibirás confirmación en minutos.',
                    retry_allowed: true,
                },
                statusCode: 402,
            });
        }
    );
}
