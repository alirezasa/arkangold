-- نمایندگان فروش: تحویل امانی شمش، فروش به مالک نهایی، تسویه، صورتحساب و حساب ورود نماینده به پنل
-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "AgentCommissionType" AS ENUM ('PERCENT', 'PER_GRAM', 'FIXED_PER_BAR');

-- CreateEnum
CREATE TYPE "AgentStockMovementType" AS ENUM ('ALLOCATION', 'RETURN', 'SALE', 'SALE_VOID');

-- CreateEnum
CREATE TYPE "AgentSaleStatus" AS ENUM ('COMPLETED', 'VOIDED');

-- CreateEnum
CREATE TYPE "AgentSettlementMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CARD_TO_CARD', 'POS', 'CHEQUE');

-- CreateEnum
CREATE TYPE "AgentSettlementStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AgentLedgerType" AS ENUM ('SALE', 'SALE_VOID', 'SETTLEMENT', 'ADJUSTMENT');

-- AlterEnum
ALTER TYPE "InvoiceSource" ADD VALUE 'AGENT_SALE';

-- AlterEnum
ALTER TYPE "HologramCodeStatus" ADD VALUE 'AT_AGENT';

-- AlterEnum
ALTER TYPE "HologramOwnershipStatus" ADD VALUE 'VOIDED';

-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "agent_id" UUID;

-- AlterTable
ALTER TABLE "hologram_codes" ADD COLUMN     "agent_allocated_at" TIMESTAMP(3),
ADD COLUMN     "agent_id" UUID,
ADD COLUMN     "agent_premium_rial" DECIMAL(18,0);

-- CreateTable
CREATE TABLE "agents" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "manager_name" TEXT NOT NULL,
    "national_code" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "province" TEXT,
    "city" TEXT,
    "address" TEXT,
    "postal_code" TEXT,
    "contract_number" TEXT,
    "contract_start_at" TIMESTAMP(3),
    "contract_end_at" TIMESTAMP(3),
    "commission_type" "AgentCommissionType" NOT NULL DEFAULT 'PERCENT',
    "commission_value" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "credit_limit_rial" DECIMAL(18,0),
    "balance_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "status" "AgentStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_stock_movements" (
    "id" UUID NOT NULL,
    "voucher_number" TEXT NOT NULL,
    "agent_id" UUID NOT NULL,
    "hologram_code_id" UUID NOT NULL,
    "type" "AgentStockMovementType" NOT NULL,
    "weight_grams" DECIMAL(18,4) NOT NULL,
    "note" TEXT,
    "reference_id" UUID,
    "journal_entry_id" UUID,
    "performed_by_admin_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_sales" (
    "id" UUID NOT NULL,
    "sale_number" TEXT NOT NULL,
    "agent_id" UUID NOT NULL,
    "hologram_code_id" UUID NOT NULL,
    "buyer_user_id" UUID NOT NULL,
    "buyer_full_name" TEXT NOT NULL,
    "buyer_national_code" TEXT NOT NULL,
    "buyer_phone" TEXT NOT NULL,
    "buyer_account_created" BOOLEAN NOT NULL DEFAULT false,
    "identity_verified" BOOLEAN NOT NULL DEFAULT false,
    "identity_verification_ref" TEXT,
    "weight_grams" DECIMAL(18,4) NOT NULL,
    "purity_karat" "GoldPurityKarat" NOT NULL,
    "gold_price_per_gram_rial" DECIMAL(18,0) NOT NULL,
    "gold_value_rial" DECIMAL(18,0) NOT NULL,
    "premium_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "total_rial" DECIMAL(18,0) NOT NULL,
    "commission_type" "AgentCommissionType" NOT NULL,
    "commission_value" DECIMAL(18,4) NOT NULL,
    "commission_rial" DECIMAL(18,0) NOT NULL,
    "net_payable_rial" DECIMAL(18,0) NOT NULL,
    "payment_method" TEXT NOT NULL,
    "payment_reference" TEXT,
    "note" TEXT,
    "status" "AgentSaleStatus" NOT NULL DEFAULT 'COMPLETED',
    "ownership_id" UUID,
    "invoice_id" UUID,
    "journal_entry_id" UUID,
    "void_journal_entry_id" UUID,
    "void_reason" TEXT,
    "voided_at" TIMESTAMP(3),
    "voided_by_admin_id" UUID,
    "sold_by_admin_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_settlements" (
    "id" UUID NOT NULL,
    "settlement_number" TEXT NOT NULL,
    "agent_id" UUID NOT NULL,
    "amount_rial" DECIMAL(18,0) NOT NULL,
    "method" "AgentSettlementMethod" NOT NULL,
    "reference_number" TEXT,
    "paid_at" TIMESTAMP(3),
    "note" TEXT,
    "status" "AgentSettlementStatus" NOT NULL DEFAULT 'PENDING',
    "rejection_reason" TEXT,
    "journal_entry_id" UUID,
    "submitted_by_admin_id" UUID,
    "reviewed_by_admin_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_ledger_entries" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "type" "AgentLedgerType" NOT NULL,
    "debit_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "credit_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "balance_after_rial" DECIMAL(18,0) NOT NULL,
    "description" TEXT NOT NULL,
    "reference_type" TEXT,
    "reference_id" UUID,
    "reference_number" TEXT,
    "journal_entry_id" UUID,
    "created_by_admin_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agents_code_key" ON "agents"("code");

-- CreateIndex
CREATE INDEX "agents_status_idx" ON "agents"("status");

-- CreateIndex
CREATE INDEX "agent_stock_movements_agent_id_created_at_idx" ON "agent_stock_movements"("agent_id", "created_at");

-- CreateIndex
CREATE INDEX "agent_stock_movements_hologram_code_id_idx" ON "agent_stock_movements"("hologram_code_id");

-- CreateIndex
CREATE INDEX "agent_stock_movements_voucher_number_idx" ON "agent_stock_movements"("voucher_number");

-- CreateIndex
CREATE UNIQUE INDEX "agent_sales_sale_number_key" ON "agent_sales"("sale_number");

-- CreateIndex
CREATE INDEX "agent_sales_agent_id_created_at_idx" ON "agent_sales"("agent_id", "created_at");

-- CreateIndex
CREATE INDEX "agent_sales_buyer_user_id_idx" ON "agent_sales"("buyer_user_id");

-- CreateIndex
CREATE INDEX "agent_sales_hologram_code_id_idx" ON "agent_sales"("hologram_code_id");

-- CreateIndex
CREATE INDEX "agent_sales_status_created_at_idx" ON "agent_sales"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "agent_settlements_settlement_number_key" ON "agent_settlements"("settlement_number");

-- CreateIndex
CREATE INDEX "agent_settlements_agent_id_status_idx" ON "agent_settlements"("agent_id", "status");

-- CreateIndex
CREATE INDEX "agent_settlements_status_created_at_idx" ON "agent_settlements"("status", "created_at");

-- CreateIndex
CREATE INDEX "agent_ledger_entries_agent_id_created_at_idx" ON "agent_ledger_entries"("agent_id", "created_at");

-- CreateIndex
CREATE INDEX "admin_users_agent_id_idx" ON "admin_users"("agent_id");

-- CreateIndex
CREATE INDEX "hologram_codes_agent_id_idx" ON "hologram_codes"("agent_id");

-- AddForeignKey
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hologram_codes" ADD CONSTRAINT "hologram_codes_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_stock_movements" ADD CONSTRAINT "agent_stock_movements_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_stock_movements" ADD CONSTRAINT "agent_stock_movements_hologram_code_id_fkey" FOREIGN KEY ("hologram_code_id") REFERENCES "hologram_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_stock_movements" ADD CONSTRAINT "agent_stock_movements_performed_by_admin_id_fkey" FOREIGN KEY ("performed_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_sales" ADD CONSTRAINT "agent_sales_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_sales" ADD CONSTRAINT "agent_sales_hologram_code_id_fkey" FOREIGN KEY ("hologram_code_id") REFERENCES "hologram_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_sales" ADD CONSTRAINT "agent_sales_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_sales" ADD CONSTRAINT "agent_sales_voided_by_admin_id_fkey" FOREIGN KEY ("voided_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_sales" ADD CONSTRAINT "agent_sales_sold_by_admin_id_fkey" FOREIGN KEY ("sold_by_admin_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_settlements" ADD CONSTRAINT "agent_settlements_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_settlements" ADD CONSTRAINT "agent_settlements_submitted_by_admin_id_fkey" FOREIGN KEY ("submitted_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_settlements" ADD CONSTRAINT "agent_settlements_reviewed_by_admin_id_fkey" FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_ledger_entries" ADD CONSTRAINT "agent_ledger_entries_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_ledger_entries" ADD CONSTRAINT "agent_ledger_entries_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

