-- AlterTable: VpnUser - добавить firstPaidAt
ALTER TABLE "vpn_users" ADD COLUMN     "firstPaidAt" TIMESTAMP(3);

-- AlterTable: Plan - добавить legacy и availableFor
ALTER TABLE "plans" ADD COLUMN     "legacy" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "plans" ADD COLUMN     "availableFor" TEXT NOT NULL DEFAULT 'ALL';

-- Обновить существующие тарифы: пометить как legacy для существующих пользователей
UPDATE "plans" SET "legacy" = true, "availableFor" = 'EXISTING_USERS' WHERE "isTrial" = false;
