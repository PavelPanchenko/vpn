ALTER TABLE "bot_config" ADD COLUMN "plategaMerchantIdEnc" TEXT;
ALTER TABLE "bot_config" ADD COLUMN "plategaSecretEnc" TEXT;
ALTER TABLE "bot_config" ADD COLUMN "plategaPaymentMethod" INTEGER;
ALTER TABLE "bot_config" ADD COLUMN "plategaReturnUrl" TEXT;
ALTER TABLE "bot_config" ADD COLUMN "plategaFailedUrl" TEXT;
