-- AlterTable
ALTER TABLE "bot_config" ADD COLUMN "cryptocloudApiKeyEnc" TEXT;
ALTER TABLE "bot_config" ADD COLUMN "cryptocloudShopId" TEXT;
ALTER TABLE "bot_config" ADD COLUMN "cryptocloudSecretKeyEnc" TEXT;
ALTER TABLE "bot_config" ADD COLUMN "publicSiteUrl" TEXT;
ALTER TABLE "bot_config" ADD COLUMN "publicSupportTelegram" TEXT;
ALTER TABLE "bot_config" ADD COLUMN "publicSupportEmail" TEXT;
ALTER TABLE "bot_config" ADD COLUMN "publicCompanyName" TEXT;
ALTER TABLE "bot_config" ADD COLUMN "panelClientLimitIp" INTEGER;
ALTER TABLE "bot_config" ADD COLUMN "telegramMiniAppUrl" TEXT;
