-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WithdrawalStatus" ADD VALUE 'CANCELLED';
ALTER TYPE "WithdrawalStatus" ADD VALUE 'RETURNED';

-- AlterTable
ALTER TABLE "withdrawal_requests" ADD COLUMN     "bank_reference" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "destination_snapshot" JSONB,
ADD COLUMN     "fee_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
ADD COLUMN     "hold_id" UUID,
ADD COLUMN     "journal_entry_id" UUID,
ADD COLUMN     "net_amount_rial" DECIMAL(18,0),
ADD COLUMN     "paid_at" TIMESTAMP(3),
ADD COLUMN     "paid_by_id" UUID,
ADD COLUMN     "payout_batch_id" TEXT,
ADD COLUMN     "payout_method" TEXT,
ADD COLUMN     "rejection_reason" TEXT,
ADD COLUMN     "request_number" TEXT,
ADD COLUMN     "return_journal_id" UUID,
ADD COLUMN     "return_reason" TEXT,
ADD COLUMN     "returned_at" TIMESTAMP(3),
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "reviewed_by_id" UUID,
ADD COLUMN     "source_account_code" TEXT,
ADD COLUMN     "transaction_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "withdrawal_requests_request_number_key" ON "withdrawal_requests"("request_number");

-- CreateIndex
CREATE UNIQUE INDEX "withdrawal_requests_transaction_id_key" ON "withdrawal_requests"("transaction_id");

-- CreateIndex
CREATE INDEX "withdrawal_requests_status_created_at_idx" ON "withdrawal_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "withdrawal_requests_payout_batch_id_idx" ON "withdrawal_requests"("payout_batch_id");


-- ── داده‌های قبلی ──
-- در نسخه‌ی قبل «تأیید» همزمان مبلغ را از کیف پول کسر و سند پرداخت را ثبت می‌کرد؛
-- آن درخواست‌ها در واقع پرداخت‌شده‌اند
UPDATE "withdrawal_requests" SET "status" = 'PROCESSED', "paid_at" = "updated_at", "reviewed_at" = "updated_at", "reviewed_by_id" = "processed_by_id", "paid_by_id" = "processed_by_id"
WHERE "status" = 'APPROVED';

UPDATE "withdrawal_requests" SET "request_number" = 'WD-' || UPPER(SUBSTRING("id"::text, 1, 8)) WHERE "request_number" IS NULL;
UPDATE "withdrawal_requests" SET "net_amount_rial" = "amount_rial" WHERE "net_amount_rial" IS NULL;
UPDATE "withdrawal_requests" SET "rejection_reason" = "admin_notes" WHERE "status" = 'REJECTED' AND "rejection_reason" IS NULL;

-- پیوند تراکنش و رزرو کیف پول (قبلاً فقط در متن description بود)
UPDATE "withdrawal_requests" w
SET "transaction_id" = t."id",
    "hold_id" = CASE WHEN t."description" ~ 'hold:[0-9a-f-]{36}'
                     THEN SUBSTRING(t."description" FROM 'hold:([0-9a-f-]{36})')::uuid END
FROM "transactions" t
WHERE t."type" = 'WITHDRAWAL'
  AND t."description" LIKE 'withdrawal:' || w."id"::text || '|%'
  AND w."transaction_id" IS NULL;

UPDATE "withdrawal_requests" w
SET "destination_snapshot" = jsonb_build_object(
      'bankName', b."bank_name", 'cardNumber', b."card_number", 'sheba', b."sheba", 'accountNumber', b."account_number")
FROM "bank_accounts" b
WHERE b."id" = w."bank_account_id" AND w."destination_snapshot" IS NULL;

-- رزرو برداشت‌های باز نباید منقضی شود (قبلاً ۷ روزه بود و موجودی رزروشده دوباره قابل خرج می‌شد)؛
-- رزرو فقط با پرداخت، رد یا لغو درخواست آزاد می‌شود
UPDATE "wallet_holds" SET "expires_at" = NOW() + INTERVAL '10 years'
WHERE "hold_type" = 'WITHDRAWAL'
  AND "id" IN (SELECT "hold_id" FROM "withdrawal_requests" WHERE "status" IN ('PENDING', 'APPROVED') AND "hold_id" IS NOT NULL);
