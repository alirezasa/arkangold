-- AlterTable
ALTER TABLE "UserSession" ADD COLUMN     "device" TEXT,
ADD COLUMN     "ip" TEXT;

-- CreateIndex
CREATE INDEX "UserSession_tokenHash_idx" ON "UserSession"("tokenHash");
