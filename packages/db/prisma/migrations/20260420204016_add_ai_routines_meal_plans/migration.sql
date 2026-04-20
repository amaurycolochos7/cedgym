-- CreateEnum
CREATE TYPE "MuscleGroup" AS ENUM ('CHEST', 'BACK', 'LEGS', 'SHOULDERS', 'ARMS', 'CORE', 'FULL_BODY', 'CARDIO');

-- CreateEnum
CREATE TYPE "ExerciseLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "FitnessGoal" AS ENUM ('WEIGHT_LOSS', 'MUSCLE_GAIN', 'MAINTENANCE', 'STRENGTH', 'ENDURANCE', 'GENERAL_FITNESS');

-- CreateEnum
CREATE TYPE "RoutineLocation" AS ENUM ('GYM', 'HOME', 'BOTH');

-- CreateEnum
CREATE TYPE "RoutineSource" AS ENUM ('AI_GENERATED', 'ADMIN_CREATED', 'TEMPLATE_ASSIGNED');

-- CreateEnum
CREATE TYPE "MealPlanSource" AS ENUM ('AI_GENERATED', 'ADMIN_CREATED');

-- CreateEnum
CREATE TYPE "MealType" AS ENUM ('BREAKFAST', 'SNACK_AM', 'LUNCH', 'SNACK_PM', 'DINNER');

-- CreateEnum
CREATE TYPE "AIGenerationKind" AS ENUM ('ROUTINE', 'MEAL_PLAN', 'REGENERATION');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "fitness_profile" JSONB;

-- CreateTable
CREATE TABLE "exercises" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "muscle_group" "MuscleGroup" NOT NULL,
    "equipment" TEXT[],
    "level" "ExerciseLevel" NOT NULL,
    "video_url" TEXT,
    "thumbnail_url" TEXT,
    "description" TEXT,
    "default_sets" INTEGER NOT NULL DEFAULT 3,
    "default_reps" TEXT NOT NULL,
    "default_rest_sec" INTEGER NOT NULL DEFAULT 60,
    "variant_easier_id" TEXT,
    "variant_harder_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routines" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "goal" "FitnessGoal" NOT NULL,
    "location" "RoutineLocation" NOT NULL,
    "days_per_week" INTEGER NOT NULL,
    "source" "RoutineSource" NOT NULL,
    "ai_generation_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routine_days" (
    "id" TEXT NOT NULL,
    "routine_id" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "order_index" INTEGER NOT NULL,

    CONSTRAINT "routine_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routine_exercises" (
    "id" TEXT NOT NULL,
    "routine_day_id" TEXT NOT NULL,
    "exercise_id" TEXT,
    "exercise_name_snapshot" TEXT NOT NULL,
    "video_url" TEXT,
    "sets" INTEGER NOT NULL,
    "reps" TEXT NOT NULL,
    "rest_sec" INTEGER NOT NULL,
    "order_index" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "routine_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_plans" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "goal" "FitnessGoal" NOT NULL,
    "calories_target" INTEGER NOT NULL,
    "protein_g" INTEGER NOT NULL,
    "carbs_g" INTEGER NOT NULL,
    "fats_g" INTEGER NOT NULL,
    "restrictions" TEXT[],
    "source" "MealPlanSource" NOT NULL,
    "ai_generation_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meal_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meals" (
    "id" TEXT NOT NULL,
    "meal_plan_id" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "meal_type" "MealType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ingredients" TEXT[],
    "calories" INTEGER NOT NULL,
    "protein_g" INTEGER NOT NULL,
    "carbs_g" INTEGER NOT NULL,
    "fats_g" INTEGER NOT NULL,
    "prep_time_min" INTEGER,
    "order_index" INTEGER NOT NULL,

    CONSTRAINT "meals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_generations" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT,
    "kind" "AIGenerationKind" NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_usd" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "prompt_snapshot" TEXT NOT NULL,
    "response_raw" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error_message" TEXT,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_generations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exercises_workspace_id_idx" ON "exercises"("workspace_id");

-- CreateIndex
CREATE INDEX "exercises_workspace_id_slug_idx" ON "exercises"("workspace_id", "slug");

-- CreateIndex
CREATE INDEX "routines_workspace_id_idx" ON "routines"("workspace_id");

-- CreateIndex
CREATE INDEX "routines_user_id_idx" ON "routines"("user_id");

-- CreateIndex
CREATE INDEX "routine_days_routine_id_idx" ON "routine_days"("routine_id");

-- CreateIndex
CREATE INDEX "routine_exercises_routine_day_id_idx" ON "routine_exercises"("routine_day_id");

-- CreateIndex
CREATE INDEX "meal_plans_workspace_id_idx" ON "meal_plans"("workspace_id");

-- CreateIndex
CREATE INDEX "meal_plans_user_id_idx" ON "meal_plans"("user_id");

-- CreateIndex
CREATE INDEX "meals_meal_plan_id_idx" ON "meals"("meal_plan_id");

-- CreateIndex
CREATE INDEX "ai_generations_workspace_id_created_at_idx" ON "ai_generations"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_generations_user_id_idx" ON "ai_generations"("user_id");

-- AddForeignKey
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_variant_easier_id_fkey" FOREIGN KEY ("variant_easier_id") REFERENCES "exercises"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_variant_harder_id_fkey" FOREIGN KEY ("variant_harder_id") REFERENCES "exercises"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routines" ADD CONSTRAINT "routines_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routines" ADD CONSTRAINT "routines_ai_generation_id_fkey" FOREIGN KEY ("ai_generation_id") REFERENCES "ai_generations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routine_days" ADD CONSTRAINT "routine_days_routine_id_fkey" FOREIGN KEY ("routine_id") REFERENCES "routines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_routine_day_id_fkey" FOREIGN KEY ("routine_day_id") REFERENCES "routine_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plans" ADD CONSTRAINT "meal_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plans" ADD CONSTRAINT "meal_plans_ai_generation_id_fkey" FOREIGN KEY ("ai_generation_id") REFERENCES "ai_generations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meals" ADD CONSTRAINT "meals_meal_plan_id_fkey" FOREIGN KEY ("meal_plan_id") REFERENCES "meal_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

