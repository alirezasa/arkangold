-- AlterEnum
ALTER TYPE "OtpPurpose" ADD VALUE 'CHANGE_PHONE';

-- CreateEnum
CREATE TYPE "MobileVerificationStatus" AS ENUM ('NOT_CHECKED', 'VERIFIED', 'MISMATCH', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "BankAccountStatus" AS ENUM ('VERIFIED', 'PENDING_INQUIRY', 'REJECTED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "mobile_check_provider" TEXT,
ADD COLUMN     "mobile_check_track_id" TEXT,
ADD COLUMN     "mobile_checked_at" TIMESTAMP(3),
ADD COLUMN     "mobile_verification_status" "MobileVerificationStatus" NOT NULL DEFAULT 'NOT_CHECKED',
ADD COLUMN     "mobile_verified_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "bank_accounts" ADD COLUMN     "card_owner_matched" BOOLEAN,
ADD COLUMN     "deposit_status" TEXT,
ADD COLUMN     "inquiry_provider" TEXT,
ADD COLUMN     "inquiry_track_id" TEXT,
ADD COLUMN     "last_inquiry_at" TIMESTAMP(3),
ADD COLUMN     "owner_name" TEXT,
ADD COLUMN     "status" "BankAccountStatus" NOT NULL DEFAULT 'PENDING_INQUIRY',
ADD COLUMN     "status_message" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "verified_at" TIMESTAMP(3);

-- حساب‌هایی که پیش‌تر کارشناس تایید کرده، «تایید شده» می‌مانند؛ بقیه در صف استعلام ادمین
UPDATE "bank_accounts" SET "status" = 'VERIFIED', "verified_at" = "created_at" WHERE "is_verified" = true;

-- CreateIndex
CREATE INDEX "bank_accounts_status_idx" ON "bank_accounts"("status");
