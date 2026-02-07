-- CreateTable
CREATE TABLE "bot_payment_methods" (
    "id" TEXT NOT NULL,
    "botConfigId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "allowedLangs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bot_payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bot_payment_methods_botConfigId_idx" ON "bot_payment_methods"("botConfigId");

-- CreateIndex
CREATE UNIQUE INDEX "bot_payment_methods_botConfigId_key_key" ON "bot_payment_methods"("botConfigId", "key");

-- AddForeignKey
ALTER TABLE "bot_payment_methods" ADD CONSTRAINT "bot_payment_methods_botConfigId_fkey" FOREIGN KEY ("botConfigId") REFERENCES "bot_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

