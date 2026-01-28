-- AlterTable
ALTER TABLE "user_servers" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT false;

-- Устанавливаем isActive=true для первой локации каждого пользователя (если еще нет активной)
UPDATE "user_servers" us1
SET "isActive" = true
WHERE us1."active" = true
  AND NOT EXISTS (
    SELECT 1
    FROM "user_servers" us2
    WHERE us2."vpnUserId" = us1."vpnUserId"
      AND us2."isActive" = true
      AND us2."id" != us1."id"
  )
  AND us1."id" = (
    SELECT us3."id"
    FROM "user_servers" us3
    WHERE us3."vpnUserId" = us1."vpnUserId"
      AND us3."active" = true
    ORDER BY us3."createdAt" ASC
    LIMIT 1
  );
