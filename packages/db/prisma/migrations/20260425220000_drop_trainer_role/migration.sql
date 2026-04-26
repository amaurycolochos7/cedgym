-- Drop TRAINER from Role enum.
-- Prod has zero TRAINER users (verified). The 5 demo courses have
-- trainer_id pointing to non-TRAINER users (ATHLETE in seed) — those
-- references stay as plain text FKs to User and keep working.

-- Postgres doesn't allow ALTER TYPE ... DROP VALUE directly.
-- Standard pattern: rename old enum, create new, swap, drop old.

ALTER TYPE "Role" RENAME TO "Role_old";

CREATE TYPE "Role" AS ENUM ('SUPERADMIN', 'ADMIN', 'RECEPTIONIST', 'ATHLETE');

-- Defensive: any TRAINER user gets demoted to ATHLETE before the cast.
UPDATE "users" SET "role" = 'ATHLETE'::text WHERE "role"::text = 'TRAINER';

ALTER TABLE "users"
  ALTER COLUMN "role" DROP DEFAULT,
  ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role"),
  ALTER COLUMN "role" SET DEFAULT 'ATHLETE';

DROP TYPE "Role_old";
