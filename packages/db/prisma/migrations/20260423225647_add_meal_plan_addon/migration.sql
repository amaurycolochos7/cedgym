-- Add MEAL_PLAN_ADDON to PaymentType enum so the one-time
-- $499 add-on purchase shows up in the payments table with the
-- right type tag (used by webhooks + admin reports).
ALTER TYPE "PaymentType" ADD VALUE 'MEAL_PLAN_ADDON';

-- CreateEnum
CREATE TYPE "MealPlanAddonStatus" AS ENUM ('PENDING', 'ACTIVE', 'CONSUMED', 'EXPIRED', 'REFUNDED');

-- CreateTable
CREATE TABLE "meal_plan_addons" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "payment_id" TEXT,
    "price_mxn" INTEGER NOT NULL,
    "paid_mxn" INTEGER NOT NULL,
    "promo_code_id" TEXT,
    "status" "MealPlanAddonStatus" NOT NULL DEFAULT 'PENDING',
    "activated_at" TIMESTAMP(3),
    "consumed_at" TIMESTAMP(3),
    "consumed_by_meal_plan_id" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meal_plan_addons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meal_plan_addons_payment_id_key" ON "meal_plan_addons"("payment_id");

-- CreateIndex
CREATE INDEX "meal_plan_addons_user_id_status_idx" ON "meal_plan_addons"("user_id", "status");

-- CreateIndex
CREATE INDEX "meal_plan_addons_workspace_id_status_idx" ON "meal_plan_addons"("workspace_id", "status");

-- AddForeignKey
ALTER TABLE "meal_plan_addons" ADD CONSTRAINT "meal_plan_addons_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plan_addons" ADD CONSTRAINT "meal_plan_addons_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
