-- Add per-domain profile JSON columns to User.
--
-- Until now the wizard wrote everything (rutina + nutrición) into a
-- single `fitness_profile` blob. Splitting them lets each domain
-- evolve its schema independently and lets the AI prompts focus on
-- the data that's actually relevant for each kind of generation.
--
-- `fitness_profile` stays for backward compatibility — endpoints
-- read it as a fallback when the new columns are NULL.

ALTER TABLE "users"
  ADD COLUMN "routine_profile"   JSONB,
  ADD COLUMN "nutrition_profile" JSONB;
