-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('ADMIN');

-- CreateEnum
CREATE TYPE "VpnProtocol" AS ENUM ('VLESS');

-- CreateEnum
CREATE TYPE "VpnTransport" AS ENUM ('WS', 'TCP');

-- CreateEnum
CREATE TYPE "VpnUserStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PAID', 'FAILED');

-- CreateTable
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vpn_servers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "protocol" "VpnProtocol" NOT NULL DEFAULT 'VLESS',
    "transport" "VpnTransport" NOT NULL,
    "tls" BOOLEAN NOT NULL DEFAULT true,
    "path" TEXT,
    "publicKey" TEXT NOT NULL,
    "shortId" TEXT NOT NULL,
    "maxUsers" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vpn_servers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vpn_users" (
    "id" TEXT NOT NULL,
    "telegramId" TEXT,
    "uuid" TEXT NOT NULL,
    "status" "VpnUserStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "serverId" TEXT NOT NULL,

    CONSTRAINT "vpn_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "vpnUserId" TEXT NOT NULL,
    "periodDays" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "vpnUserId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PAID',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "vpn_users_uuid_key" ON "vpn_users"("uuid");

-- CreateIndex
CREATE INDEX "vpn_users_serverId_idx" ON "vpn_users"("serverId");

-- CreateIndex
CREATE INDEX "subscriptions_vpnUserId_idx" ON "subscriptions"("vpnUserId");

-- CreateIndex
CREATE INDEX "payments_vpnUserId_idx" ON "payments"("vpnUserId");

-- AddForeignKey
ALTER TABLE "vpn_users" ADD CONSTRAINT "vpn_users_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "vpn_servers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_vpnUserId_fkey" FOREIGN KEY ("vpnUserId") REFERENCES "vpn_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_vpnUserId_fkey" FOREIGN KEY ("vpnUserId") REFERENCES "vpn_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
