-- Drop QUARTERLY and ANNUAL from BillingCycle enum.
-- Prod has zero memberships of any cycle (verified). Defensive UPDATE
-- still demotes any non-MONTHLY rows to MONTHLY before the cast.

ALTER TYPE "BillingCycle" RENAME TO "BillingCycle_old";

CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY');

UPDATE "memberships" SET "billing_cycle" = 'MONTHLY'::text
  WHERE "billing_cycle"::text IN ('QUARTERLY', 'ANNUAL');

UPDATE "payments" SET "metadata" = jsonb_set(
  COALESCE("metadata", '{}'::jsonb),
  '{billing_cycle}',
  '"MONTHLY"'::jsonb
)
  WHERE "metadata"->>'billing_cycle' IN ('QUARTERLY', 'ANNUAL');

ALTER TABLE "memberships"
  ALTER COLUMN "billing_cycle" DROP DEFAULT,
  ALTER COLUMN "billing_cycle" TYPE "BillingCycle" USING ("billing_cycle"::text::"BillingCycle"),
  ALTER COLUMN "billing_cycle" SET DEFAULT 'MONTHLY';

DROP TYPE "BillingCycle_old";
