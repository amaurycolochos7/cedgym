-- Remove the gym-classes feature end-to-end. We stopped shipping
-- class bookings so every surface that consumed these tables is
-- already gone from the code. This migration drops the DB objects
-- so they stop showing up in introspection / prisma generate.

DROP TABLE IF EXISTS "class_bookings" CASCADE;

DROP TABLE IF EXISTS "class_schedules" CASCADE;

DROP TYPE IF EXISTS "BookingStatus";

ALTER TABLE "user_progress" DROP COLUMN IF EXISTS "total_classes";
