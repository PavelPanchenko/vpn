-- Payment intents (provider-agnostic pre-payment records)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentIntentStatus') THEN
    CREATE TYPE "PaymentIntentStatus" AS ENUM ('PENDING', 'PAID', 'CANCELED', 'EXPIRED', 'CHARGEBACK');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentProvider') THEN
    CREATE TYPE "PaymentProvider" AS ENUM ('TELEGRAM_STARS', 'PLATEGA');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "payment_intents" (
  "id" TEXT NOT NULL,
  "vpnUserId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "provider" "PaymentProvider" NOT NULL,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "status" "PaymentIntentStatus" NOT NULL DEFAULT 'PENDING',
  "externalId" TEXT,
  "checkoutUrl" TEXT,
  "invoiceLink" TEXT,
  "payload" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "payment_intents_vpnUserId_idx" ON "payment_intents"("vpnUserId");
CREATE INDEX IF NOT EXISTS "payment_intents_planId_idx" ON "payment_intents"("planId");
CREATE INDEX IF NOT EXISTS "payment_intents_status_expiresAt_idx" ON "payment_intents"("status", "expiresAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_intents_vpnUserId_fkey') THEN
    ALTER TABLE "payment_intents"
      ADD CONSTRAINT "payment_intents_vpnUserId_fkey"
      FOREIGN KEY ("vpnUserId") REFERENCES "vpn_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_intents_planId_fkey') THEN
    ALTER TABLE "payment_intents"
      ADD CONSTRAINT "payment_intents_planId_fkey"
      FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Unique (provider, externalId) but allow multiple NULL externalId
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'payment_intents_provider_externalId_key'
  ) THEN
    CREATE UNIQUE INDEX "payment_intents_provider_externalId_key"
      ON "payment_intents"("provider", "externalId")
      WHERE "externalId" IS NOT NULL;
  END IF;
END $$;

-- Payments: optional link to intent
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "paymentIntentId" TEXT;
CREATE INDEX IF NOT EXISTS "payments_paymentIntentId_idx" ON "payments"("paymentIntentId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_paymentIntentId_fkey') THEN
    ALTER TABLE "payments"
      ADD CONSTRAINT "payments_paymentIntentId_fkey"
      FOREIGN KEY ("paymentIntentId") REFERENCES "payment_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

