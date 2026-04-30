// ─────────────────────────────────────────────────────────────────
// Stripe webhook handler.
//
// POST /webhooks/stripe
//
// - No JWT. We validate Stripe's `stripe-signature` header via
//   `stripe.webhooks.constructEvent(rawBody, sig, secret)`.
// - The SDK MUST see the raw body, not the JSON-parsed object —
//   any whitespace difference breaks the HMAC. We override the
//   default Fastify JSON parser inside this encapsulated route
//   plugin so it stays raw for /webhooks/stripe and JSON-parsed
//   for every other route.
// - Idempotent via Redis (stripe:webhook:{event.id}, 24h TTL).
// - Always returns 200 on non-auth failures so Stripe stops
//   retrying once we've logged the problem.
// - Side-effects (membership activation, addon delivery,
//   WhatsApp notifications) live in handler functions imported
//   from the route's own module — but in Phase 2 they are
//   intentionally NO-OPS that just log. Activation logic lands
//   in Phase 5.
// ─────────────────────────────────────────────────────────────────

import { constructWebhookEvent } from '../lib/stripe.js';

// Events we care about. Anything else is acked + logged + ignored.
const HANDLED_EVENTS = new Set([
    'payment_intent.succeeded',
    'payment_intent.payment_failed',
    'invoice.payment_succeeded',
    'invoice.payment_failed',
    'customer.subscription.deleted',
    'customer.subscription.updated',
    'charge.refunded',
]);

export default async function stripeWebhookRoutes(fastify) {
    const { redis } = fastify;

    // Override the JSON parser ONLY in this encapsulation context so
    // the handler receives the raw Buffer (required by
    // stripe.webhooks.constructEvent). Other routes keep their normal
    // JSON-parsed bodies because Fastify scopes content-type parsers
    // to the plugin that registers them.
    fastify.addContentTypeParser(
        'application/json',
        { parseAs: 'buffer' },
        (_req, body, done) => done(null, body),
    );

    fastify.post('/webhooks/stripe', async (req, reply) => {
        const rawBody = req.body; // Buffer — see content parser above
        const sigHeader = req.headers['stripe-signature'];

        // ── Signature verification ────────────────────────────────
        let event;
        try {
            event = constructWebhookEvent(rawBody, sigHeader);
        } catch (e) {
            req.log.warn(
                { err: e?.message },
                '[stripe-webhook] signature verification failed',
            );
            // 401 here so Stripe knows it was rejected for auth (still
            // retries up to 3 days, but that's fine — it gives us a
            // window to fix a misconfigured webhook secret).
            return reply.code(401).send({ error: 'invalid_signature' });
        }

        // ── Idempotency guard ─────────────────────────────────────
        // Stripe guarantees event.id uniqueness, so we use it as the
        // dedupe key. Stripe retries on 5xx for up to 3 days; the
        // key TTL of 24h is enough to cover the bulk of those.
        const idempKey = `stripe:webhook:${event.id}`;
        if (redis) {
            try {
                const claimed = await redis.set(idempKey, '1', 'EX', 86400, 'NX');
                if (claimed !== 'OK') {
                    req.log.info(
                        { eventId: event.id, type: event.type },
                        '[stripe-webhook] duplicate — already processed',
                    );
                    return reply.send({ received: true, duplicate: true });
                }
            } catch (e) {
                req.log.error(
                    { err: e },
                    '[stripe-webhook] redis idempotency failed — continuing',
                );
            }
        }

        if (!HANDLED_EVENTS.has(event.type)) {
            req.log.info(
                { eventId: event.id, type: event.type },
                '[stripe-webhook] event type not handled',
            );
            return reply.send({ received: true, handled: false });
        }

        try {
            await processStripeEvent(fastify, event);
        } catch (e) {
            req.log.error(
                { err: e, eventId: event.id, type: event.type },
                '[stripe-webhook] processing failed',
            );
            // Roll back the idempotency claim so Stripe's retry has a
            // chance to succeed.
            if (redis) {
                try { await redis.del(idempKey); } catch {}
            }
            // Still 200 — we don't want Stripe DoSing us over a bug.
            return reply.send({ received: true, handled: false, error: e.message });
        }

        return reply.send({ received: true, handled: true });
    });
}

// ─────────────────────────────────────────────────────────────────
// Phase 2 stub — every event is acked and logged. Phase 5 wires the
// real activation/lifecycle handlers (membership renewal on invoice
// paid, addon activation on payment_intent.succeeded, etc.).
// ─────────────────────────────────────────────────────────────────
async function processStripeEvent(fastify, event) {
    fastify.log.info(
        {
            eventId: event.id,
            type: event.type,
            objectId: event.data?.object?.id,
        },
        '[stripe-webhook] received (Phase 2 stub — no side-effects yet)',
    );
}
