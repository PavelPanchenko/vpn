-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "planId" TEXT;

-- CreateIndex
CREATE INDEX "payments_planId_idx" ON "payments"("planId");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
