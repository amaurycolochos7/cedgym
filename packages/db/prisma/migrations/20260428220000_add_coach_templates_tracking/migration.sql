-- ============================================================================
-- Coach-Templates V1 — tracking columns (DO NOT AUTO-APPLY)
-- ============================================================================
-- Adds nullable columns to `routines` and `meal_plans` to track which
-- coach-template (if any) drove a generation, and whether the route had
-- to fall back to the deterministic template payload.
--
-- Status: PREPARED — apply when product is ready to start populating
--   these fields from apps/api/src/routes/ai-{routines,meal-plans}.js.
--
-- Apply with:
--   pnpm --filter @cedgym/db prisma migrate deploy
--
-- Rollback (manual; Prisma has no down-migration):
--   ALTER TABLE "routines"   DROP COLUMN IF EXISTS "template_id";
--   ALTER TABLE "routines"   DROP COLUMN IF EXISTS "template_used_fallback";
--   ALTER TABLE "meal_plans" DROP COLUMN IF EXISTS "template_id";
--   ALTER TABLE "meal_plans" DROP COLUMN IF EXISTS "template_used_fallback";
-- ============================================================================

ALTER TABLE "routines"
    ADD COLUMN IF NOT EXISTS "template_id"            TEXT,
    ADD COLUMN IF NOT EXISTS "template_used_fallback" BOOLEAN DEFAULT false;

ALTER TABLE "meal_plans"
    ADD COLUMN IF NOT EXISTS "template_id"            TEXT,
    ADD COLUMN IF NOT EXISTS "template_used_fallback" BOOLEAN DEFAULT false;

-- Indexes are intentionally NOT created. Selectivity is low (most rows
-- will share a small set of template_ids) and these are trace columns,
-- not query predicates. Add indexes only if a future report needs them.
