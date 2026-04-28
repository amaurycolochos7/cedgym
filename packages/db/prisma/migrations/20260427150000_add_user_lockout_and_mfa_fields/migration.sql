-- Login lockout + MFA groundwork on the users table.
--
-- All columns are additive with safe defaults — no data migration
-- needed. On Postgres 11+ none of these alters rewrite the table
-- (defaults are stored in pg_attribute metadata, not backfilled).

ALTER TABLE "users" ADD COLUMN "failed_login_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "locked_until" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "mfa_secret" TEXT;
ALTER TABLE "users" ADD COLUMN "mfa_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "mfa_recovery_codes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
