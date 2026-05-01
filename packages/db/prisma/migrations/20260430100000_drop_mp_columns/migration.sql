-- ============================================================================
-- Drop MercadoPago columns — Phase 7 cleanup
-- ============================================================================
-- After the MP → Stripe migration is fully shipped (Phases 1-6), the mp_*
-- columns no longer have any code paths reading or writing them. This drops
-- them. Existing rows lose their MP identifiers permanently — backfill is
-- not possible without scraping the MP dashboard manually.
--
-- IMPORTANT: only run AFTER the Stripe code paths are live (subscribe-stripe
-- + purchase-stripe + /webhooks/stripe). Running this with any code still
-- referencing mp_* columns will throw at runtime.
--
-- Apply with:
--   pnpm --filter @cedgym/db prisma migrate deploy
--
-- Rollback (manual):
--   ALTER TABLE "memberships" ADD COLUMN "mp_subscription_id" TEXT;
--   ALTER TABLE "payments"    ADD COLUMN "mp_payment_id" TEXT,
--                              ADD COLUMN "mp_preference_id" TEXT,
--                              ADD COLUMN "mp_status_detail" TEXT;
--   -- Note: original data is GONE. Rollback gives you the columns back, not the values.
-- ============================================================================

ALTER TABLE "memberships"
    DROP COLUMN IF EXISTS "mp_subscription_id";

ALTER TABLE "payments"
    DROP COLUMN IF EXISTS "mp_payment_id",
    DROP COLUMN IF EXISTS "mp_preference_id",
    DROP COLUMN IF EXISTS "mp_status_detail";
