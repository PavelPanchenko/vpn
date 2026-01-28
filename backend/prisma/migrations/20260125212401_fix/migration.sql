/*
  Warnings:

  - A unique constraint covering the columns `[panelEmail]` on the table `vpn_users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "vpn_users" ADD COLUMN     "panelEmail" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "vpn_users_panelEmail_key" ON "vpn_users"("panelEmail");
