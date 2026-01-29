-- Сначала убираем дубликаты: для каждого telegramId оставляем одну запись (самую раннюю по createdAt), у остальных обнуляем telegramId
UPDATE "vpn_users" u
SET "telegramId" = NULL
FROM (
  SELECT id,
    "telegramId",
    ROW_NUMBER() OVER (PARTITION BY "telegramId" ORDER BY "createdAt") AS rn
  FROM "vpn_users"
  WHERE "telegramId" IS NOT NULL
) d
WHERE u.id = d.id AND d.rn > 1;

-- Теперь добавляем уникальное ограничение
CREATE UNIQUE INDEX "vpn_users_telegramId_key" ON "vpn_users"("telegramId");
