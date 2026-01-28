-- CreateEnum
CREATE TYPE "SupportMessageType" AS ENUM ('USER_MESSAGE', 'ADMIN_REPLY');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "support_messages" (
    "id" TEXT NOT NULL,
    "vpnUserId" TEXT NOT NULL,
    "type" "SupportMessageType" NOT NULL,
    "message" TEXT NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_messages_vpnUserId_idx" ON "support_messages"("vpnUserId");

-- CreateIndex
CREATE INDEX "support_messages_status_idx" ON "support_messages"("status");

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_vpnUserId_fkey" FOREIGN KEY ("vpnUserId") REFERENCES "vpn_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
