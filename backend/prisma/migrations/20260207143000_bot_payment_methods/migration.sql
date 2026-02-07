-- AlterTable
ALTER TABLE "bot_config"
ADD COLUMN     "paymentsStarsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "paymentsPlategaEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "paymentsPlategaAllowedLangs" TEXT[] NOT NULL DEFAULT ARRAY['ru']::TEXT[];

