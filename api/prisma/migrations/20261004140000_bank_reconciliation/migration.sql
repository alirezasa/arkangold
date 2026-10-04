-- AlterTable
ALTER TABLE "ledger_entries" ADD COLUMN     "reconciled_at" TIMESTAMP(3),
ADD COLUMN     "reconciliation_id" UUID;

-- CreateTable
CREATE TABLE "bank_reconciliations" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "statement_date" TIMESTAMP(3) NOT NULL,
    "statement_balance_rial" DECIMAL(18,0) NOT NULL,
    "book_balance_rial" DECIMAL(18,0) NOT NULL,
    "cleared_balance_rial" DECIMAL(18,0) NOT NULL,
    "difference_rial" DECIMAL(18,0) NOT NULL,
    "outstanding_debit_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "outstanding_credit_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bank_reconciliations_account_id_statement_date_idx" ON "bank_reconciliations"("account_id", "statement_date");

-- CreateIndex
CREATE INDEX "ledger_entries_reconciliation_id_idx" ON "ledger_entries"("reconciliation_id");

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_reconciliation_id_fkey" FOREIGN KEY ("reconciliation_id") REFERENCES "bank_reconciliations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

