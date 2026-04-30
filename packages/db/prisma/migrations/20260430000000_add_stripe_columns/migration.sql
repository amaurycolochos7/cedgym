-- ============================================================================
-- Stripe migration — additive columns (Phase 1 of MP → Stripe migration)
-- ============================================================================
-- Adds nullable Stripe identifier columns alongside the existing mp_* fields.
-- Existing payments / memberships keep their mp_* values; new Stripe-flow
-- writes populate the stripe_* columns. The mp_* columns are dropped in a
-- later migration once the MP code path is fully removed (Phase 7).
--
-- Tables touched:
--   users                 stripe_customer_id (1:1 lifetime, null until first checkout)
--   memberships           stripe_subscription_id, stripe_price_id
--   payments              stripe_payment_intent_id, stripe_invoice_id, stripe_charge_id
--
-- Apply with:
--   pnpm --filter @cedgym/db prisma migrate deploy
--
-- Rollback (manual; Prisma has no down-migration):
--   ALTER TABLE "users"        DROP COLUMN IF EXISTS "stripe_customer_id";
--   ALTER TABLE "memberships"  DROP COLUMN IF EXISTS "stripe_subscription_id";
--   ALTER TABLE "memberships"  DROP COLUMN IF EXISTS "stripe_price_id";
--   ALTER TABLE "payments"     DROP COLUMN IF EXISTS "stripe_payment_intent_id";
--   ALTER TABLE "payments"     DROP COLUMN IF EXISTS "stripe_invoice_id";
--   ALTER TABLE "payments"     DROP COLUMN IF EXISTS "stripe_charge_id";
-- ============================================================================

ALTER TABLE "users"
    ADD COLUMN IF NOT EXISTS "stripe_customer_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "users_stripe_customer_id_key"
    ON "users" ("stripe_customer_id");

ALTER TABLE "memberships"
    ADD COLUMN IF NOT EXISTS "stripe_subscription_id" TEXT,
    ADD COLUMN IF NOT EXISTS "stripe_price_id"        TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "memberships_stripe_subscription_id_key"
    ON "memberships" ("stripe_subscription_id");

ALTER TABLE "payments"
    ADD COLUMN IF NOT EXISTS "stripe_payment_intent_id" TEXT,
    ADD COLUMN IF NOT EXISTS "stripe_invoice_id"        TEXT,
    ADD COLUMN IF NOT EXISTS "stripe_charge_id"         TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "payments_stripe_payment_intent_id_key"
    ON "payments" ("stripe_payment_intent_id");

CREATE UNIQUE INDEX IF NOT EXISTS "payments_stripe_invoice_id_key"
    ON "payments" ("stripe_invoice_id");
