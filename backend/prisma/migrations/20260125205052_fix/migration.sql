-- CreateEnum
CREATE TYPE "VpnSecurity" AS ENUM ('NONE', 'TLS', 'REALITY');

-- AlterTable
ALTER TABLE "vpn_servers" ADD COLUMN     "panelBaseUrl" TEXT,
ADD COLUMN     "panelInboundId" INTEGER,
ADD COLUMN     "panelPasswordEnc" TEXT,
ADD COLUMN     "panelUsername" TEXT,
ADD COLUMN     "security" "VpnSecurity" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "sni" TEXT;
