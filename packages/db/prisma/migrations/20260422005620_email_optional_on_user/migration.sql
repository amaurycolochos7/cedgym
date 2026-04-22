-- Make User.email optional. The column already has a UNIQUE index, which
-- in PostgreSQL treats NULLs as distinct (multiple users without email
-- are allowed) — exactly what we want.
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
