// ─────────────────────────────────────────────────────────────────
// Mercado Pago SDK wrapper.
//
// Uses the official SDK (mercadopago@^2). Lazy-initialized so tests
// / the seed script can import this module without MP_ACCESS_TOKEN
// being set. In production the env var must be set or any routing
// call that touches MP will fail with a clear error.
// ─────────────────────────────────────────────────────────────────

import {
    MercadoPagoConfig,
    Preference,
    Payment,
    PreApproval,
} from 'mercadopago';

let _client = null;

function getClient() {
    if (_client) return _client;
    const token = process.env.MP_ACCESS_TOKEN;
    if (!token) {
        throw new Error('MP_ACCESS_TOKEN env var is required for Mercado Pago operations');
    }
    _client = new MercadoPagoConfig({
        accessToken: token,
        options: { timeout: 10000 },
    });
    return _client;
}

export function hasMpKey() {
    return !!process.env.MP_ACCESS_TOKEN;
}

export function getWebhookSecret() {
    return process.env.MP_WEBHOOK_SECRET || null;
}

// ────────────────────────────────────────────────────────────────
// createPreference — Checkout Pro (one-time payment flow)
//
// Params:
//   userId             — local user id (goes into metadata)
//   type               — PaymentType local enum ('MEMBERSHIP' | 'COURSE' | …)
//   reference          — free-form local reference (plan code, product id…)
//   items              — [{ id, title, quantity, unit_price }]
//   payer              — { email, name? }
//   back_urls          — { success, failure, pending }
//   notification_url   — webhook URL (must be public; MP validates HTTPS)
//   external_reference — MUST be the local Payment.id so we can look it
//                        up in the webhook
//   metadata           — anything else we want echoed back
//
// Returns: { preferenceId, init_point, sandbox_init_point }
// ────────────────────────────────────────────────────────────────
export async function createPreference({
    userId,
    type,
    reference,
    items,
    payer,
    back_urls,
    notification_url,
    external_reference,
    metadata,
    payment_methods,
}) {
    const client = getClient();
    const preference = new Preference(client);

    const body = {
        items: items.map((it) => ({
            id: String(it.id),
            title: String(it.title),
            quantity: Number(it.quantity || 1),
            currency_id: 'MXN',
            unit_price: Number(it.unit_price),
        })),
        payer: payer
            ? { email: payer.email, name: payer.name }
            : undefined,
        // Excluding `account_money` (MP wallet) here is what makes Checkout
        // Pro skip the "iniciá sesión en MP" wall and go straight to the
        // card / OXXO form — otherwise MP recognizes the payer.email and
        // forces the user to log in to that wallet first.
        payment_methods: payment_methods || {
            excluded_payment_types: [{ id: 'account_money' }],
        },
        back_urls,
        // auto_return only works when success URL is set
        auto_return: back_urls?.success ? 'approved' : undefined,
        notification_url,
        external_reference: String(external_reference),
        statement_descriptor: 'CED-GYM',
        metadata: {
            user_id: userId,
            type,
            reference: reference || null,
            ...(metadata || {}),
        },
    };

    const resp = await preference.create({ body });
    return {
        preferenceId: resp.id,
        init_point: resp.init_point,
        sandbox_init_point: resp.sandbox_init_point,
    };
}

// ────────────────────────────────────────────────────────────────
// createSubscription — PreApproval (recurring billing)
//
// For now we use PreApproval without a pre-created plan (ad-hoc). MP
// accepts the full auto_recurring block inline.
// ────────────────────────────────────────────────────────────────
export async function createSubscription({
    reason,
    external_reference,
    payer_email,
    amount,
    frequency_type = 'months',
    frequency = 1,
    back_url,
}) {
    const client = getClient();
    const preapproval = new PreApproval(client);

    const body = {
        reason,
        external_reference: String(external_reference),
        payer_email,
        back_url,
        auto_recurring: {
            frequency: Number(frequency),
            frequency_type,   // 'days' | 'months'
            transaction_amount: Number(amount),
            currency_id: 'MXN',
        },
        status: 'pending',
    };

    const resp = await preapproval.create({ body });
    return {
        subscriptionId: resp.id,
        init_point: resp.init_point,
        status: resp.status,
    };
}

// ────────────────────────────────────────────────────────────────
// getPayment — fetch the authoritative payment resource from MP
// after the webhook tells us something happened.
// ────────────────────────────────────────────────────────────────
export async function getPayment(paymentId) {
    const client = getClient();
    const payment = new Payment(client);
    return payment.get({ id: paymentId });
}

// ────────────────────────────────────────────────────────────────
// createCardPayment — Payment Bricks flow (embedded checkout).
//
// The frontend tokenizes the card via MP's Payment Brick SDK and
// sends us the one-time `token` + `payment_method_id`. We charge
// straight to MP without leaving our site (no init_point redirect).
//
// Params:
//   transaction_amount — total in MXN (integer pesos)
//   token              — one-time card token from the Brick
//   payment_method_id  — 'visa', 'master', 'amex', etc.
//   installments       — 1..12
//   payer_email        — required by MP for card payments
//   description        — shows on the cardholder statement / MP receipt
//   external_reference — local Payment.id so the webhook can reconcile
//   metadata           — echoed back on the webhook payload
//
// Returns the raw MP Payment resource (has .id, .status, .status_detail,
// .date_approved, .payment_method_id, .installments, etc.).
// ────────────────────────────────────────────────────────────────
export async function createCardPayment({
    transaction_amount,
    token,
    payment_method_id,
    installments = 1,
    payer_email,
    description,
    external_reference,
    metadata,
}) {
    const client = getClient();
    const payment = new Payment(client);

    const body = {
        transaction_amount: Number(transaction_amount),
        token,
        description,
        installments: Number(installments),
        payment_method_id,
        payer: payer_email ? { email: payer_email } : undefined,
        external_reference: String(external_reference),
        statement_descriptor: 'CED-GYM',
        metadata: metadata || undefined,
    };

    // requestOptions.idempotencyKey prevents duplicate charges on
    // retries. MP recommends a UUID per logical attempt; we use the
    // external_reference + token so a retried POST with the same
    // body never double-charges.
    return payment.create({
        body,
        requestOptions: {
            idempotencyKey: `${external_reference}:${String(token).slice(0, 12)}`,
        },
    });
}

// ────────────────────────────────────────────────────────────────
// cancelSubscription — used when a user clicks "cancel auto-renew".
// ────────────────────────────────────────────────────────────────
export async function cancelSubscription(subscriptionId) {
    const client = getClient();
    const preapproval = new PreApproval(client);
    return preapproval.update({
        id: subscriptionId,
        body: { status: 'cancelled' },
    });
}

// ────────────────────────────────────────────────────────────────
// mapPaymentStatus — MP status string → local PaymentStatus enum.
// MP statuses: approved | pending | in_process | rejected |
//              refunded | cancelled | charged_back | authorized
// ────────────────────────────────────────────────────────────────
export function mapPaymentStatus(mpStatus) {
    switch (mpStatus) {
        case 'approved':
        case 'authorized':
            return 'APPROVED';
        case 'pending':
        case 'in_process':
            return 'PENDING';
        case 'rejected':
            return 'REJECTED';
        case 'refunded':
        case 'charged_back':
            return 'REFUNDED';
        case 'cancelled':
            return 'CANCELED';
        default:
            return 'PENDING';
    }
}

export default {
    createPreference,
    createSubscription,
    createCardPayment,
    getPayment,
    cancelSubscription,
    mapPaymentStatus,
    hasMpKey,
    getWebhookSecret,
};
