-- AlterTable
ALTER TABLE "vpn_users" ADD COLUMN "telegramLanguageCode" TEXT;

-- CreateIndex
CREATE INDEX "vpn_users_telegramLanguageCode_idx" ON "vpn_users"("telegramLanguageCode");

