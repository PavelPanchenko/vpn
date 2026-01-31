-- Remove legacy flag from plans (no longer used)
ALTER TABLE "plans" DROP COLUMN IF EXISTS "legacy";

