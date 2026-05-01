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
import { audit, auditCtx } from '../lib/audit.js';
import { assertWorkspaceAccess } from '../lib/tenant-guard.js';
import { SETTING_KEYS, getWorkspaceSetting, setWorkspaceSetting } from '../lib/settings.js';

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
            const workspaceId = assertWorkspaceAccess(req);
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

            const workspaceId = assertWorkspaceAccess(req);
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
            const workspaceId = assertWorkspaceAccess(req);
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

    // POST /addons/meal-plan/purchase-card lived here (MP Brick flow).
    // Replaced by POST /addons/meal-plan/purchase-stripe (addons-stripe.js).
}
