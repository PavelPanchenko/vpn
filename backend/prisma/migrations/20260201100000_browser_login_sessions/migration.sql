-- Create enum for browser login sessions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BrowserLoginStatus') THEN
    CREATE TYPE "BrowserLoginStatus" AS ENUM ('PENDING', 'APPROVED', 'EXPIRED');
  END IF;
END $$;

-- Create table
CREATE TABLE IF NOT EXISTS "browser_login_sessions" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "status" "BrowserLoginStatus" NOT NULL DEFAULT 'PENDING',
  "telegramId" TEXT,
  "vpnUserId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "browser_login_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "browser_login_sessions_code_key" ON "browser_login_sessions"("code");
CREATE INDEX IF NOT EXISTS "browser_login_sessions_status_expiresAt_idx" ON "browser_login_sessions"("status", "expiresAt");
CREATE INDEX IF NOT EXISTS "browser_login_sessions_telegramId_idx" ON "browser_login_sessions"("telegramId");
CREATE INDEX IF NOT EXISTS "browser_login_sessions_vpnUserId_idx" ON "browser_login_sessions"("vpnUserId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'browser_login_sessions_vpnUserId_fkey') THEN
    ALTER TABLE "browser_login_sessions"
      ADD CONSTRAINT "browser_login_sessions_vpnUserId_fkey"
      FOREIGN KEY ("vpnUserId") REFERENCES "vpn_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

