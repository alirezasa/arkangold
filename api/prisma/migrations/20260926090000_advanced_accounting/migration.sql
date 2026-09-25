-- حسابداری پیشرفته: سرفصل سلسله‌مراتبی، شماره عطف/قطعی اسناد، سال مالی، اسناد دستی،
-- خزانه (خرید پوششی طلا و تأمین‌کنندگان)، شمارش خزانه، شرکای فروش اقساطی و کدگذاری شمش

-- CreateEnum
CREATE TYPE "JournalSource" AS ENUM ('SYSTEM', 'MANUAL', 'OPENING', 'CLOSING', 'REVALUATION', 'REVERSAL', 'TREASURY', 'PARTNER', 'INVENTORY');

-- CreateEnum
CREATE TYPE "FiscalYearStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "ManualVoucherType" AS ENUM ('GENERAL', 'OPENING', 'EXPENSE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "ManualVoucherStatus" AS ENUM ('DRAFT', 'POSTED', 'REJECTED', 'CANCELLED', 'REVERSED');

-- CreateEnum
CREATE TYPE "SupplierKind" AS ENUM ('MELTED_GOLD_DEALER', 'MINT', 'REFINERY', 'BANK', 'OTHER');

-- CreateEnum
CREATE TYPE "TreasurySide" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "TreasuryAssetType" AS ENUM ('MELTED_GOLD', 'BULLION');

-- CreateEnum
CREATE TYPE "TreasuryOrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentDirection" AS ENUM ('PAY', 'RECEIVE');

-- CreateEnum
CREATE TYPE "PartyType" AS ENUM ('SUPPLIER', 'PARTNER');

-- CreateEnum
CREATE TYPE "PartnerKind" AS ENUM ('BNPL', 'RESELLER_APP', 'MARKETPLACE', 'CORPORATE', 'OTHER');

-- CreateEnum
CREATE TYPE "PartnerStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "PartnerProductKind" AS ENUM ('MELTED_GOLD', 'BULLION');

-- CreateEnum
CREATE TYPE "PartnerOrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'SETTLED', 'CANCELLED', 'REFUNDED');

-- AlterEnum
ALTER TYPE "InvoiceSource" ADD VALUE 'PARTNER_ORDER';

-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'INSTALLMENT_PURCHASE';

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "allow_manual_entry" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "is_system" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "parent_id" UUID;

-- AlterTable
ALTER TABLE "journal_entries" ADD COLUMN     "created_by_admin_id" UUID,
ADD COLUMN     "finalized_at" TIMESTAMP(3),
ADD COLUMN     "fiscal_year_id" UUID,
ADD COLUMN     "permanent_number" INTEGER,
ADD COLUMN     "reference_id" TEXT,
ADD COLUMN     "reference_number" SERIAL NOT NULL,
ADD COLUMN     "reference_type" TEXT,
ADD COLUMN     "reversal_of_id" UUID,
ADD COLUMN     "source" "JournalSource" NOT NULL DEFAULT 'SYSTEM';

-- AlterTable
ALTER TABLE "ledger_entries" ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "hologram_codes" ADD COLUMN     "vault_coded_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "fiscal_years" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "status" "FiscalYearStatus" NOT NULL DEFAULT 'OPEN',
    "closed_at" TIMESTAMP(3),
    "closed_by_admin_id" UUID,
    "closing_journal_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_vouchers" (
    "id" UUID NOT NULL,
    "voucher_number" TEXT NOT NULL,
    "type" "ManualVoucherType" NOT NULL DEFAULT 'GENERAL',
    "status" "ManualVoucherStatus" NOT NULL DEFAULT 'DRAFT',
    "entry_date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "lines" JSONB NOT NULL,
    "total_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "total_grams" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "attachment_ref" TEXT,
    "created_by_admin_id" UUID NOT NULL,
    "approved_by_admin_id" UUID,
    "approved_at" TIMESTAMP(3),
    "reject_reason" TEXT,
    "journal_entry_id" UUID,
    "reversal_journal_entry_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manual_vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "SupplierKind" NOT NULL DEFAULT 'MELTED_GOLD_DEALER',
    "national_id" TEXT,
    "economic_code" TEXT,
    "contact_person" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "iban" TEXT,
    "balance_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treasury_orders" (
    "id" UUID NOT NULL,
    "order_number" TEXT NOT NULL,
    "side" "TreasurySide" NOT NULL,
    "asset_type" "TreasuryAssetType" NOT NULL,
    "status" "TreasuryOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "supplier_id" UUID NOT NULL,
    "gross_weight_grams" DECIMAL(18,4) NOT NULL,
    "purity_millesimal" INTEGER NOT NULL,
    "fine_grams" DECIMAL(18,4) NOT NULL,
    "bar_count" INTEGER,
    "price_per_gram_rial" DECIMAL(18,0) NOT NULL,
    "gold_value_rial" DECIMAL(18,0) NOT NULL,
    "wage_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "fee_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "tax_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "total_rial" DECIMAL(18,0) NOT NULL,
    "paid_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "requested_grams" DECIMAL(18,4),
    "coverage_snapshot" JSONB,
    "supplier_invoice_no" TEXT,
    "assay_certificate_no" TEXT,
    "vault_location" TEXT,
    "note" TEXT,
    "cancel_reason" TEXT,
    "confirm_journal_id" UUID,
    "receive_journal_id" UUID,
    "cancel_journal_id" UUID,
    "created_by_admin_id" UUID NOT NULL,
    "confirmed_by_admin_id" UUID,
    "confirmed_at" TIMESTAMP(3),
    "received_by_admin_id" UUID,
    "received_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treasury_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" UUID NOT NULL,
    "payment_number" TEXT NOT NULL,
    "supplier_id" UUID NOT NULL,
    "order_id" UUID,
    "direction" "PaymentDirection" NOT NULL,
    "amount_rial" DECIMAL(18,0) NOT NULL,
    "method" "AgentSettlementMethod" NOT NULL,
    "cash_account_code" TEXT NOT NULL DEFAULT '1010',
    "reference_number" TEXT,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "journal_entry_id" UUID,
    "created_by_admin_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vault_counts" (
    "id" UUID NOT NULL,
    "count_number" TEXT NOT NULL,
    "asset_type" "TreasuryAssetType" NOT NULL,
    "book_grams" DECIMAL(18,4) NOT NULL,
    "counted_grams" DECIMAL(18,4) NOT NULL,
    "difference_grams" DECIMAL(18,4) NOT NULL,
    "note" TEXT,
    "journal_entry_id" UUID,
    "counted_by_admin_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vault_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "party_ledger_entries" (
    "id" UUID NOT NULL,
    "party_type" "PartyType" NOT NULL,
    "party_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "debit_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "credit_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "balance_after_rial" DECIMAL(18,0) NOT NULL,
    "description" TEXT NOT NULL,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "reference_number" TEXT,
    "journal_entry_id" UUID,
    "created_by_admin_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "party_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_partners" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PartnerKind" NOT NULL DEFAULT 'BNPL',
    "provider_key" TEXT,
    "status" "PartnerStatus" NOT NULL DEFAULT 'ACTIVE',
    "commission_percent" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "commission_fixed_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "settlement_days" INTEGER NOT NULL DEFAULT 0,
    "credit_limit_rial" DECIMAL(18,0),
    "min_order_rial" DECIMAL(18,0),
    "max_order_rial" DECIMAL(18,0),
    "allowed_products" "PartnerProductKind"[] DEFAULT ARRAY['MELTED_GOLD']::"PartnerProductKind"[],
    "balance_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "contract_number" TEXT,
    "contract_start_at" TIMESTAMP(3),
    "contract_end_at" TIMESTAMP(3),
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "iban" TEXT,
    "national_id" TEXT,
    "economic_code" TEXT,
    "notes" TEXT,
    "api_enabled" BOOLEAN NOT NULL DEFAULT false,
    "api_key_hash" TEXT,
    "api_key_prefix" TEXT,
    "api_ip_whitelist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "webhook_url" TEXT,
    "created_by_admin_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_orders" (
    "id" UUID NOT NULL,
    "order_number" TEXT NOT NULL,
    "partner_id" UUID NOT NULL,
    "external_ref" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "product_kind" "PartnerProductKind" NOT NULL,
    "status" "PartnerOrderStatus" NOT NULL DEFAULT 'PENDING',
    "amount_grams" DECIMAL(18,4) NOT NULL,
    "hologram_code_id" UUID,
    "price_per_gram_rial" DECIMAL(18,0) NOT NULL,
    "gold_value_rial" DECIMAL(18,0) NOT NULL,
    "wage_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "fee_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "tax_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "total_rial" DECIMAL(18,0) NOT NULL,
    "down_payment_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "installment_count" INTEGER,
    "installment_plan" JSONB,
    "commission_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "net_receivable_rial" DECIMAL(18,0) NOT NULL,
    "due_date" TIMESTAMP(3),
    "settlement_id" UUID,
    "customer_snapshot" JSONB,
    "note" TEXT,
    "cancel_reason" TEXT,
    "confirm_journal_id" UUID,
    "refund_journal_id" UUID,
    "invoice_id" UUID,
    "transaction_id" UUID,
    "created_via" TEXT NOT NULL DEFAULT 'ADMIN',
    "created_by_admin_id" UUID,
    "confirmed_at" TIMESTAMP(3),
    "settled_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_settlements" (
    "id" UUID NOT NULL,
    "settlement_number" TEXT NOT NULL,
    "partner_id" UUID NOT NULL,
    "amount_rial" DECIMAL(18,0) NOT NULL,
    "method" "AgentSettlementMethod" NOT NULL,
    "cash_account_code" TEXT NOT NULL DEFAULT '1010',
    "reference_number" TEXT,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "journal_entry_id" UUID,
    "created_by_admin_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fiscal_years_start_date_end_date_idx" ON "fiscal_years"("start_date", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "manual_vouchers_voucher_number_key" ON "manual_vouchers"("voucher_number");

-- CreateIndex
CREATE INDEX "manual_vouchers_status_entry_date_idx" ON "manual_vouchers"("status", "entry_date");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_code_key" ON "suppliers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "treasury_orders_order_number_key" ON "treasury_orders"("order_number");

-- CreateIndex
CREATE INDEX "treasury_orders_status_created_at_idx" ON "treasury_orders"("status", "created_at");

-- CreateIndex
CREATE INDEX "treasury_orders_supplier_id_created_at_idx" ON "treasury_orders"("supplier_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_payments_payment_number_key" ON "supplier_payments"("payment_number");

-- CreateIndex
CREATE INDEX "supplier_payments_supplier_id_created_at_idx" ON "supplier_payments"("supplier_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "vault_counts_count_number_key" ON "vault_counts"("count_number");

-- CreateIndex
CREATE INDEX "party_ledger_entries_party_type_party_id_created_at_idx" ON "party_ledger_entries"("party_type", "party_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sales_partners_code_key" ON "sales_partners"("code");

-- CreateIndex
CREATE UNIQUE INDEX "sales_partners_api_key_hash_key" ON "sales_partners"("api_key_hash");

-- CreateIndex
CREATE INDEX "sales_partners_status_idx" ON "sales_partners"("status");

-- CreateIndex
CREATE UNIQUE INDEX "partner_orders_order_number_key" ON "partner_orders"("order_number");

-- CreateIndex
CREATE INDEX "partner_orders_partner_id_status_created_at_idx" ON "partner_orders"("partner_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "partner_orders_user_id_idx" ON "partner_orders"("user_id");

-- CreateIndex
CREATE INDEX "partner_orders_status_due_date_idx" ON "partner_orders"("status", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "partner_orders_partner_id_external_ref_key" ON "partner_orders"("partner_id", "external_ref");

-- CreateIndex
CREATE UNIQUE INDEX "partner_settlements_settlement_number_key" ON "partner_settlements"("settlement_number");

-- CreateIndex
CREATE INDEX "partner_settlements_partner_id_created_at_idx" ON "partner_settlements"("partner_id", "created_at");

-- CreateIndex
CREATE INDEX "accounts_parent_id_idx" ON "accounts"("parent_id");

-- شماره عطف اسناد موجود به ترتیب زمان ثبت (نه ترتیب فیزیکی ردیف‌ها)
UPDATE "journal_entries" AS j SET "reference_number" = o.rn
FROM (SELECT "id", ROW_NUMBER() OVER (ORDER BY "created_at", "id") AS rn FROM "journal_entries") AS o
WHERE j."id" = o."id";
SELECT setval(pg_get_serial_sequence('journal_entries', 'reference_number'),
              GREATEST((SELECT COALESCE(MAX("reference_number"), 0) FROM "journal_entries"), 1),
              (SELECT COUNT(*) > 0 FROM "journal_entries"));

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_reference_number_key" ON "journal_entries"("reference_number");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_reversal_of_id_key" ON "journal_entries"("reversal_of_id");

-- CreateIndex
CREATE INDEX "journal_entries_entry_date_idx" ON "journal_entries"("entry_date");

-- CreateIndex
CREATE INDEX "journal_entries_source_entry_date_idx" ON "journal_entries"("source", "entry_date");

-- CreateIndex
CREATE INDEX "journal_entries_reference_type_reference_id_idx" ON "journal_entries"("reference_type", "reference_id");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_fiscal_year_id_permanent_number_key" ON "journal_entries"("fiscal_year_id", "permanent_number");

-- CreateIndex
CREATE INDEX "ledger_entries_account_id_created_at_idx" ON "ledger_entries"("account_id", "created_at");

-- CreateIndex
CREATE INDEX "ledger_entries_journal_entry_id_idx" ON "ledger_entries"("journal_entry_id");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_years"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treasury_orders" ADD CONSTRAINT "treasury_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "treasury_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_orders" ADD CONSTRAINT "partner_orders_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "sales_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_orders" ADD CONSTRAINT "partner_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_orders" ADD CONSTRAINT "partner_orders_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "partner_settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_settlements" ADD CONSTRAINT "partner_settlements_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "sales_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

