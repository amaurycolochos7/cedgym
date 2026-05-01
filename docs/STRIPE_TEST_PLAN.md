# Stripe migration — test plan (Phase 8)

End-to-end test checklist for the MP → Stripe migration. All tests run with
**Stripe Test Mode** keys (`pk_test_…` / `sk_test_…`) — they never charge a
real card. The list deliberately includes failure paths and security checks.

## 0. Prerequisites

1. Test-mode publishable key in `apps/web/.env.local`:
   ```
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
   ```
2. Test-mode secret key + webhook secret in the API container env (Dokploy
   for prod, or `apps/api/.env` for full-local mode):
   ```
   STRIPE_SECRET_KEY=sk_test_xxx
   STRIPE_WEBHOOK_SECRET=whsec_xxx
   STRIPE_PRICE_STARTER_MONTHLY=price_xxx     # test-mode prices
   STRIPE_PRICE_PRO_MONTHLY=price_xxx
   STRIPE_PRICE_ELITE_MONTHLY=price_xxx
   STRIPE_PRICE_MEAL_PLAN_ADDON=price_xxx
   ```
3. Webhook endpoint in Stripe Test Mode → `https://api.187-77-11-79.sslip.io/webhooks/stripe`
   (or use the Stripe CLI `stripe listen --forward-to localhost:3001/webhooks/stripe`
   for local dev).
4. DB migrations applied: `pnpm --filter @cedgym/db prisma migrate deploy`
5. Templates re-seeded so the WhatsApp post-payment notification picks up
   the Stripe vars: `node apps/api/src/seed-automations.js`.

## 1. Membership — happy path

### 1.1 New member, $599 STARTER monthly, card 4242 4242 4242 4242
1. Log in as a member with no active membership.
2. Open the plan picker, select STARTER.
3. Click **Continuar al pago**.
4. Enter test card `4242 4242 4242 4242`, CVC `123`, any future expiry.
5. Click **Pagar ahora**.

**Expect:**
- Stripe.confirmPayment resolves successfully without redirect.
- Frontend hits `/memberships/sync-stripe-payment` with the payment id.
- Welcome screen shows.
- DB: Membership row `status=ACTIVE`, `expires_at` ≈ now+30d, `stripe_subscription_id` populated.
- DB: Payment row `status=APPROVED`, `stripe_payment_intent_id`, `stripe_invoice_id`, `stripe_charge_id` populated.
- WhatsApp message arrives within ~10s with the receipt block (monto, fecha, tarjeta `Visa ····4242`, `pi_xxx`).

### 1.2 PRO/ELITE first-time inscription bundling
Same as 1.1 but pick PRO (or ELITE) for a member with `inscription_paid_at = NULL`.

**Expect:**
- Stripe Invoice has 2 line items: the recurring price + a one-shot
  `Inscripción única CED·GYM` ($109 MXN).
- After webhook: User.inscription_paid_at is set.
- Re-subscribing the same user to ELITE later does **not** add the
  inscription line again.

### 1.3 Renewal (auto-charge from Stripe)
1. Manually advance the subscription's billing date in Stripe Dashboard
   → Subscription → "Update billing cycle anchor" / "Pay now" on the
   draft invoice.
2. The webhook `invoice.payment_succeeded` fires.

**Expect:**
- New Payment row created (no UI interaction).
- Membership.expires_at extended by 30d from prior expires_at.
- WhatsApp "Pago confirmado" message fires (renewal copy).

## 2. Membership — failure paths

### 2.1 Card declined
Test card `4000 0000 0000 0002`.

**Expect:**
- `stripe.confirmPayment` returns an error with `card_declined`.
- UI shows the rose error banner with Stripe's localized message.
- DB Payment row stays `PENDING` (frontend never hit the sync endpoint).
- No Membership rollover.

### 2.2 3D Secure challenge
Test card `4000 0027 6000 3184`.

**Expect:**
- The Payment Element shows the 3DS challenge inline (Stripe iframe).
- After the user clicks "Complete authentication", the flow continues normally.
- Membership activated.

### 2.3 Insufficient funds
Test card `4000 0000 0000 9995`.

**Expect:**
- Same flow as 2.1; Stripe error code `insufficient_funds`.

### 2.4 Expired card
Test card `4000 0000 0000 0069`.

**Expect:**
- Stripe error `expired_card`. Same UX as 2.1.

### 2.5 CVC fail
Test card `4000 0000 0000 0127`.

**Expect:**
- Stripe error `incorrect_cvc`. Same UX as 2.1.

### 2.6 Subscription with cancelled card mid-cycle
1. Activate a subscription with a normal test card.
2. In Stripe Dashboard → PaymentMethods, detach the card from the customer.
3. Trigger the next renewal manually.

**Expect:**
- `invoice.payment_failed` webhook fires → log line.
- Stripe Smart Retries kick in (4 retries over 7 days, dunning emails).
- After 7d if all retries fail, `customer.subscription.deleted` fires →
  Membership.auto_renew set to false; status stays ACTIVE through expires_at,
  flips to EXPIRED on the daily expiry job.

## 3. Meal-plan addon

### 3.1 Happy path with active membership
1. Logged-in user with an active membership.
2. Open the addon modal.
3. Continuar → Pay with `4242…`.

**Expect:**
- `payment_intent.succeeded` webhook fires (not `invoice.*` — this is a
  standalone PI, not a subscription).
- MealPlanAddon.status = ACTIVE.
- WhatsApp arrives with the addon-specific copy.

### 3.2 Anti-stacking
Try to buy a second addon when one is already ACTIVE.

**Expect:** 409 `ADDON_ALREADY_ACTIVE`.

### 3.3 Membership gate
Try the addon flow with no active membership.

**Expect:** 403 `MEMBERSHIP_REQUIRED`.

## 4. Promo codes

### 4.1 100% off membership (bypass — Stripe never called)
1. Admin creates a 100% off promo code.
2. Member enters the code in the modal, applies it.
3. The CTA changes to "Activar membresía sin costo".
4. Click it.

**Expect:**
- Backend `/memberships/subscribe-stripe` returns `bypass: true`.
- No Stripe Customer created, no PaymentIntent, no Subscription.
- Membership activated synchronously, `metadata.bypass = 'promo_100'`.
- WhatsApp `payment.approved` fires (without `stripe.*` fields — they degrade to '').

### 4.2 Partial discount
Apply a 50% off promo: $599 → $299 + $109 inscription = $408 total.

**Expect:**
- Stripe Coupon created with `amount_off = 30000` (i.e. $300 in centavos),
  `duration: once`, `max_redemptions: 1`.
- Subscription invoice subtotal $708, after coupon $408. Charge $408.

### 4.3 Promo expired / disabled / exhausted
**Expect:** 400 `PROMO_INVALID` with the reason message.

## 5. Webhook security

### 5.1 Valid signature → 200
Stripe Dashboard → Webhooks → the test endpoint → "Send test webhook" with
any event we handle.

**Expect:** 200 `{ received: true, ... }`.

### 5.2 Invalid signature → 401
```
curl -X POST https://api.187-77-11-79.sslip.io/webhooks/stripe \
  -H 'stripe-signature: t=0,v1=00' \
  -H 'content-type: application/json' \
  -d '{"id":"evt_test","type":"payment_intent.succeeded"}'
```

**Expect:** 401 `{ error: "invalid_signature" }`. Log line warns.

### 5.3 Replay (same event delivered twice)
Stripe Dashboard → an event → "Resend".

**Expect:** Second delivery returns `{ received: true, duplicate: true }`.
No double-activation, no second WhatsApp.

### 5.4 Body tamper (valid signature for original body, but body modified)
Edge case — caught by `constructEvent` because the HMAC is over the raw body.

### 5.5 Stale timestamp
Stripe SDK rejects timestamps outside ±5 min. Out of our control to test
without manually crafting the payload, but it's covered by the SDK.

## 6. Refund flow

### 6.1 Full refund from Stripe Dashboard
1. Find a paid charge in Stripe Test Mode.
2. Click "Refund payment".

**Expect:**
- `charge.refunded` webhook fires.
- Local Payment.status = REFUNDED.
- Payment.metadata.stripe_refunded_amount_mxn set.
- `payment.refunded` event fires (no automation downstream yet, but the
  hook is in place for Phase 9).
- Membership / Addon NOT auto-reverted — admin operation.

### 6.2 Partial refund
Refund only $200 of a $599 payment.

**Expect:**
- Payment.status stays APPROVED.
- metadata.stripe_refunded_amount_mxn = 200, stripe_refund_full = false.

## 7. Cancel flow

### 7.1 Member cancels in portal → POST /memberships/cancel
**Expect:**
- Stripe call: `stripe.subscriptions.update(sub_id, { cancel_at_period_end: true })`.
- Local Membership.auto_renew = false.
- Membership stays ACTIVE through current expires_at.
- `customer.subscription.updated` webhook arrives → mirror auto_renew = false.
- At the end of the period, `customer.subscription.deleted` fires → status flips
  to CANCELED (since the period is over).

## 8. Auth + tenant isolation

### 8.1 Anonymous can't subscribe
```
curl -X POST https://api.187-77-11-79.sslip.io/memberships/subscribe-stripe \
  -H 'content-type: application/json' \
  -d '{"plan":"PRO"}'
```
**Expect:** 401 unauthorized.

### 8.2 Member A can't sync member B's payment
1. Create payment as user A.
2. With user B's JWT, call `POST /memberships/sync-stripe-payment` with
   user A's payment id.

**Expect:** 404 `PAYMENT_NOT_FOUND` (intentionally same shape as 404 to avoid
existence enumeration).

### 8.3 Rate limit
Hammer `/memberships/subscribe-stripe` >6 times in 60s with the same JWT.

**Expect:** 7th request gets 429 with the standard rate-limit envelope.

## 9. Operational

### 9.1 Server-side price not spoofable
Try to send `{plan: "STARTER", amount: 1}` in the body.

**Expect:** Backend ignores `amount` (it's not in the Zod schema). The
Subscription is billed by Stripe at whatever the configured Price says.

### 9.2 Coupon leak
After consuming a one-shot coupon (Stripe Dashboard → Coupons), try to
manually attach it to another subscription.

**Expect:** Stripe rejects with `max_redemptions` exceeded.

### 9.3 Cold boot of API
1. Wipe Redis.
2. Restart API.

**Expect:** API boots cleanly. First webhook idempotency check sets the
key without trouble. No replay protection lost (Stripe still rejects
stale timestamps via SDK).

## 10. Frontend smoke

### 10.1 Type check
```
pnpm --filter @cedgym/web typecheck
```
**Expect:** Same 5 pre-existing errors, no new ones from the migration files.

### 10.2 Build
```
pnpm --filter @cedgym/web build
```
**Expect:** Build succeeds. No runtime warnings about missing
`NEXT_PUBLIC_MP_PUBLIC_KEY` (it's gone from the codebase).

### 10.3 Modal smoke (manual)
- Plan modal renders. Select plan. Stage transitions to summary, then to
  PaymentElement on click. PaymentElement loads (no console errors).
- Addon modal: same flow.

---

## Done-list

- [ ] All section 1 happy paths pass
- [ ] All section 2 failure paths return the documented errors
- [ ] Section 3 addon flow works
- [ ] Section 4 promos work (especially 100%-off bypass)
- [ ] Section 5 webhook security blocks invalid signatures + replays
- [ ] Section 6 refund flow updates the local row
- [ ] Section 7 cancel honors the period
- [ ] Section 8 auth + tenant isolation hold
- [ ] Section 10.1 typecheck clean (vs. pre-migration baseline)
- [ ] WhatsApp template received with all Stripe vars populated
