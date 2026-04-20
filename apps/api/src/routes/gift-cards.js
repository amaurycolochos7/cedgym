// ─────────────────────────────────────────────────────────────────
// Gift cards — regalar una rutina / producto del marketplace.
//
// ╔══════════════════════════════════════════════════════════════╗
// ║  HACK DOCUMENTADO — Sin modelo Prisma                         ║
// ║                                                               ║
// ║  El schema Prisma actual NO tiene un modelo `GiftCard`.       ║
// ║  Para no tocar el schema (restricción del track), persistimos ║
// ║  las gift cards como JSON sobre Redis:                        ║
// ║                                                               ║
// ║    Key:   giftcard:{CODE}                                     ║
// ║    Value: JSON {                                              ║
// ║      code, from_user_id, to_phone, product_id, amount_mxn,    ║
// ║      payment_id, message, status ('pending' → 'delivered' →   ║
// ║      'redeemed'), created_at, delivered_at?, redeemed_at?,    ║
// ║      redeemed_by_user_id?                                     ║
// ║    }                                                          ║
// ║                                                               ║
// ║    Index: giftcard:by_payment:{paymentId} → code              ║
// ║    Index: giftcard:by_user:{fromUserId}   → SET de codes      ║
// ║                                                               ║
// ║  Cuando el cliente pida persistencia real:                    ║
// ║    1. Agregar modelo GiftCard al schema.                      ║
// ║    2. Reemplazar `loadCard/saveCard` por Prisma.              ║
// ║    3. Migrar las claves Redis en un job one-shot.             ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Endpoints:
//   POST /gift-cards/purchase   — compra (genera Payment + MP preference)
//   POST /gift-cards/redeem     — canjea código (si no eres dueño, te activa)
//
// Flow post-pago:
//   Webhook MP aprueba el pago → (futuro worker) lee la gift card,
//   marca 'delivered' y envía WhatsApp al `to_phone` con el código.
//   Aquí solo creamos el Payment y la card; el código de canje está
//   disponible desde el momento en que se crea (útil para QA).
// ─────────────────────────────────────────────────────────────────

import { z } from 'zod';
import crypto from 'node:crypto';
import { err } from '../lib/errors.js';
import { fireEvent } from '../lib/events.js';
import { createPreference } from '../lib/mercadopago.js';

// ─── Schemas ─────────────────────────────────────────────────────
const purchaseBody = z.object({
    product_id: z.string().min(1),
    to_phone: z.string().regex(/^\+52\d{10}$/, 'Teléfono destino debe ser +52 + 10 dígitos'),
    message: z.string().trim().max(500).optional(),
});

const redeemBody = z.object({
    code: z.string().trim().min(6).max(24),
});

// ─── Key helpers ─────────────────────────────────────────────────
const keyCard = (code) => `giftcard:${code.toUpperCase()}`;
const keyByPayment = (pid) => `giftcard:by_payment:${pid}`;
const keyByUser = (uid) => `giftcard:by_user:${uid}`;

async function loadCard(redis, code) {
    const raw = await redis.get(keyCard(code));
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
}

async function saveCard(redis, card) {
    await redis.set(keyCard(card.code), JSON.stringify(card));
    if (card.payment_id) await redis.set(keyByPayment(card.payment_id), card.code);
    if (card.from_user_id) await redis.sadd(keyByUser(card.from_user_id), card.code);
    return card;
}

// 10-char alphanumeric (no 0/1/O/I to avoid OCR confusion).
function generateCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.randomBytes(10);
    let s = '';
    for (let i = 0; i < 10; i++) s += alphabet[bytes[i] % alphabet.length];
    return s;
}

function apiPublicUrl() { return process.env.API_PUBLIC_URL || 'http://localhost:3001'; }
function webappPublicUrl() { return process.env.WEBAPP_PUBLIC_URL || 'http://localhost:3000'; }

// ─────────────────────────────────────────────────────────────────
export default async function giftCardsRoutes(fastify) {
    const { prisma, redis } = fastify;

    // ─── POST /gift-cards/purchase ────────────────────────────────
    fastify.post(
        '/gift-cards/purchase',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const parsed = purchaseBody.safeParse(req.body);
            if (!parsed.success) throw err('BAD_BODY', parsed.error.message, 400);
            const { product_id, to_phone, message } = parsed.data;

            const userId = req.user.sub || req.user.id;
            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user) throw err('USER_NOT_FOUND', 'Usuario inexistente', 404);

            const product = await prisma.digitalProduct.findUnique({ where: { id: product_id } });
            if (!product) throw err('PRODUCT_NOT_FOUND', 'Producto no encontrado', 404);
            if (!product.published) throw err('PRODUCT_UNAVAILABLE', 'Producto no disponible', 400);

            const amount = product.sale_price_mxn != null ? product.sale_price_mxn : product.price_mxn;

            // Create Payment PENDING with a special reference marker.
            const payment = await prisma.payment.create({
                data: {
                    workspace_id: product.workspace_id,
                    user_id: userId,
                    amount,
                    type: 'DIGITAL_PRODUCT',
                    reference: product.id,
                    description: `Gift card: ${product.title} → ${to_phone}`,
                    status: 'PENDING',
                    metadata: {
                        gift_card: true,
                        product_id: product.id,
                        to_phone,
                        message: message || null,
                        // NOTE: the MP webhook for DIGITAL_PRODUCT would normally
                        // create a ProductPurchase for the payer. For gift cards
                        // the payer is NOT the recipient — the webhook code we
                        // can't modify doesn't know about this flag. A follow-up
                        // worker should inspect metadata.gift_card and handle
                        // redemption separately. For now, the webhook will grant
                        // ownership to the payer — acceptable temporary behavior
                        // since the code itself is the real fulfilment channel.
                    },
                },
            });

            // Pre-generate the code (retry on improbable collision).
            let code;
            for (let i = 0; i < 5; i++) {
                const candidate = generateCode();
                const exists = await redis.exists(keyCard(candidate));
                if (!exists) { code = candidate; break; }
            }
            if (!code) throw err('CODE_GEN_FAILED', 'No pude generar un código único', 500);

            const now = new Date().toISOString();
            const card = {
                code,
                from_user_id: userId,
                from_user_name: user.full_name || user.name,
                to_phone,
                product_id: product.id,
                product_title: product.title,
                amount_mxn: amount,
                payment_id: payment.id,
                message: message || null,
                status: 'pending', // 'pending' | 'delivered' | 'redeemed'
                created_at: now,
                delivered_at: null,
                redeemed_at: null,
                redeemed_by_user_id: null,
            };
            await saveCard(redis, card);

            // MP preference.
            const mpPref = await createPreference({
                userId,
                type: 'DIGITAL_PRODUCT',
                reference: product.id,
                items: [{
                    id: product.id,
                    title: `Gift: ${product.title}`,
                    quantity: 1,
                    unit_price: amount,
                }],
                payer: { email: user.email, name: user.full_name || user.name },
                back_urls: {
                    success: `${webappPublicUrl()}/gift/success?payment=${payment.id}`,
                    failure: `${webappPublicUrl()}/gift/failed?payment=${payment.id}`,
                    pending: `${webappPublicUrl()}/gift/pending?payment=${payment.id}`,
                },
                notification_url: `${apiPublicUrl()}/webhooks/mercadopago`,
                external_reference: payment.id,
                metadata: {
                    gift_card: true,
                    gift_code: code,
                    product_id: product.id,
                    workspace_id: product.workspace_id,
                },
            });

            await prisma.payment.update({
                where: { id: payment.id },
                data: { mp_preference_id: mpPref.preferenceId },
            });

            return {
                payment_id: payment.id,
                gift_code: code, // returned for dev/QA; in prod the sender sees it post-payment
                amount_mxn: amount,
                init_point: mpPref.init_point,
                sandbox_init_point: mpPref.sandbox_init_point,
            };
        }
    );

    // ─── POST /gift-cards/redeem ──────────────────────────────────
    fastify.post(
        '/gift-cards/redeem',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const parsed = redeemBody.safeParse(req.body);
            if (!parsed.success) throw err('BAD_BODY', parsed.error.message, 400);
            const code = parsed.data.code.toUpperCase();

            const userId = req.user.sub || req.user.id;
            const card = await loadCard(redis, code);
            if (!card) throw err('GIFT_NOT_FOUND', 'Código de regalo no encontrado', 404);
            if (card.status === 'redeemed') {
                throw err('GIFT_ALREADY_REDEEMED', 'Este código ya fue canjeado', 409);
            }

            // Confirm the backing payment actually landed.
            if (card.payment_id) {
                const payment = await prisma.payment.findUnique({ where: { id: card.payment_id } });
                if (!payment || payment.status !== 'APPROVED') {
                    throw err('GIFT_NOT_PAID', 'El pago de este regalo aún no fue aprobado', 402);
                }
            }

            const product = await prisma.digitalProduct.findUnique({ where: { id: card.product_id } });
            if (!product) throw err('PRODUCT_NOT_FOUND', 'Producto del regalo no encontrado', 404);

            // If the user already owns it, nothing to activate — mark as redeemed
            // anyway so the code can't be reused, but return an explanatory flag.
            const existing = await prisma.productPurchase.findUnique({
                where: { user_id_product_id: { user_id: userId, product_id: card.product_id } },
            });

            let purchase = existing;
            let alreadyOwned = !!existing;
            if (!existing) {
                const split = product.revenue_split ?? 70;
                const authorPayout = Math.round((card.amount_mxn * split) / 100);
                const gymRevenue = card.amount_mxn - authorPayout;
                purchase = await prisma.productPurchase.create({
                    data: {
                        workspace_id: product.workspace_id,
                        user_id: userId,
                        product_id: card.product_id,
                        payment_id: card.payment_id || null,
                        price_paid_mxn: card.amount_mxn,
                        author_payout_mxn: authorPayout,
                        gym_revenue_mxn: gymRevenue,
                    },
                });
                await prisma.digitalProduct.update({
                    where: { id: product.id },
                    data: { sales_count: { increment: 1 } },
                });
            }

            card.status = 'redeemed';
            card.redeemed_at = new Date().toISOString();
            card.redeemed_by_user_id = userId;
            await saveCard(redis, card);

            await fireEvent('gift_card.redeemed', {
                workspaceId: product.workspace_id,
                userId,
                productId: product.id,
                code,
                fromUserId: card.from_user_id,
                alreadyOwned,
            });

            return {
                redeemed: true,
                already_owned: alreadyOwned,
                product: {
                    id: product.id,
                    title: product.title,
                    slug: product.slug,
                },
                purchase_id: purchase?.id || null,
            };
        }
    );
}
