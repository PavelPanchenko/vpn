-- AlterTable
ALTER TABLE "vpn_users" ALTER COLUMN "serverId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "user_servers" (
    "id" TEXT NOT NULL,
    "vpnUserId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "panelEmail" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_servers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_servers_panelEmail_key" ON "user_servers"("panelEmail");

-- CreateIndex
CREATE INDEX "user_servers_vpnUserId_idx" ON "user_servers"("vpnUserId");

-- CreateIndex
CREATE INDEX "user_servers_serverId_idx" ON "user_servers"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "user_servers_vpnUserId_serverId_key" ON "user_servers"("vpnUserId", "serverId");

-- AddForeignKey
ALTER TABLE "user_servers" ADD CONSTRAINT "user_servers_vpnUserId_fkey" FOREIGN KEY ("vpnUserId") REFERENCES "vpn_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_servers" ADD CONSTRAINT "user_servers_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "vpn_servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
