/*
  Warnings:

  - You are about to drop the column `token` on the `UserSession` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[tokenHash]` on the table `UserSession` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `tokenHash` to the `UserSession` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "RegistrationStep" AS ENUM ('OTP_VERIFIED', 'PASSWORD_SET', 'PROFILE_COMPLETED', 'KYC_VERIFIED');

-- AlterEnum
ALTER TYPE "KycStatus" ADD VALUE 'FAILED';

-- DropIndex
DROP INDEX "UserSession_token_key";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "registrationStep" "RegistrationStep" NOT NULL DEFAULT 'OTP_VERIFIED';

-- AlterTable
ALTER TABLE "UserOtp" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "UserSession" DROP COLUMN "token",
ADD COLUMN     "tokenHash" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "UserOtp_mobile_type_idx" ON "UserOtp"("mobile", "type");

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_tokenHash_key" ON "UserSession"("tokenHash");
