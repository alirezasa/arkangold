-- CreateEnum
CREATE TYPE "DepositProformaStatus" AS ENUM ('ISSUED', 'CONFIRMED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DepositReceiptStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "deposit_proformas" (
    "id" UUID NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'large_transfer',
    "amount_rial" DECIMAL(18,0) NOT NULL,
    "tracking_id" TEXT NOT NULL,
    "destination_account" TEXT NOT NULL,
    "destination_sheba" TEXT NOT NULL,
    "recipient_name" TEXT NOT NULL,
    "recipient_national_id" TEXT NOT NULL,
    "recipient_economic_code" TEXT,
    "user_full_name" TEXT,
    "user_national_code" TEXT,
    "status" "DepositProformaStatus" NOT NULL DEFAULT 'ISSUED',
    "downloaded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" UUID NOT NULL,
    "transaction_id" UUID,

    CONSTRAINT "deposit_proformas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposit_receipts" (
    "id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "description" TEXT,
    "status" "DepositReceiptStatus" NOT NULL DEFAULT 'PENDING',
    "admin_notes" TEXT,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "proforma_id" UUID,

    CONSTRAINT "deposit_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "deposit_proformas_invoice_number_key" ON "deposit_proformas"("invoice_number");

-- CreateIndex
CREATE INDEX "deposit_proformas_user_id_idx" ON "deposit_proformas"("user_id");

-- CreateIndex
CREATE INDEX "deposit_proformas_tracking_id_idx" ON "deposit_proformas"("tracking_id");

-- CreateIndex
CREATE INDEX "deposit_receipts_user_id_idx" ON "deposit_receipts"("user_id");

-- CreateIndex
CREATE INDEX "deposit_receipts_status_idx" ON "deposit_receipts"("status");

-- CreateIndex
CREATE INDEX "deposit_receipts_transaction_id_idx" ON "deposit_receipts"("transaction_id");

-- AddForeignKey
ALTER TABLE "deposit_proformas" ADD CONSTRAINT "deposit_proformas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_proformas" ADD CONSTRAINT "deposit_proformas_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_receipts" ADD CONSTRAINT "deposit_receipts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_receipts" ADD CONSTRAINT "deposit_receipts_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_receipts" ADD CONSTRAINT "deposit_receipts_proforma_id_fkey" FOREIGN KEY ("proforma_id") REFERENCES "deposit_proformas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
