-- خرید و فروش قطعی نمایندگان: کیف پول ریالی جدا، حساب بانکی، فهرست قیمت نمایندگی،
-- سفارش خرید شمش از شرکت (صورتحساب به نام نماینده)، فروش شمش به شرکت، واریز و برداشت.

-- ── مقادیر جدید enumهای موجود ──
ALTER TYPE "HologramCodeStatus" ADD VALUE 'AGENT_OWNED';
ALTER TYPE "AgentStockMovementType" ADD VALUE 'PURCHASE';
ALTER TYPE "AgentStockMovementType" ADD VALUE 'BUYBACK';
ALTER TYPE "AgentSettlementMethod" ADD VALUE 'WALLET';
ALTER TYPE "AgentLedgerType" ADD VALUE 'PURCHASE';
ALTER TYPE "InvoiceSource" ADD VALUE 'AGENT_PURCHASE';

-- ── enumهای جدید ──
CREATE TYPE "AgentSaleStockSource" AS ENUM ('CONSIGNMENT', 'OWNED');
CREATE TYPE "AgentLegalType" AS ENUM ('INDIVIDUAL', 'LEGAL');
CREATE TYPE "AgentBankAccountStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');
CREATE TYPE "AgentWalletTxType" AS ENUM ('DEPOSIT', 'PURCHASE', 'PURCHASE_REFUND', 'BUYBACK', 'WITHDRAWAL', 'WITHDRAWAL_REVERSAL', 'DEBT_SETTLEMENT', 'ADJUSTMENT');
CREATE TYPE "AgentDepositMethod" AS ENUM ('GATEWAY', 'BANK_TRANSFER');
CREATE TYPE "AgentDepositStatus" AS ENUM ('PENDING_PAYMENT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'FAILED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "AgentPurchaseStatus" AS ENUM ('PENDING_PAYMENT', 'PAYMENT_REVIEW', 'PAID', 'APPROVED', 'DELIVERED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "AgentPurchasePaymentMethod" AS ENUM ('WALLET', 'GATEWAY', 'BANK_TRANSFER', 'CREDIT');
CREATE TYPE "AgentBuybackStatus" AS ENUM ('PENDING_DELIVERY', 'RECEIVED', 'APPROVED', 'PAID', 'REJECTED', 'CANCELLED');
CREATE TYPE "AgentWithdrawalStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'REJECTED', 'CANCELLED');

-- ── نماینده: مشخصات حقوقی/صنفی و مجوزهای امانی و اعتباری ──
ALTER TABLE "agents"
    ADD COLUMN "legal_type" "AgentLegalType" NOT NULL DEFAULT 'INDIVIDUAL',
    ADD COLUMN "agent_national_id" TEXT,
    ADD COLUMN "agent_registration_number" TEXT,
    ADD COLUMN "economic_code" TEXT,
    ADD COLUMN "business_license_number" TEXT,
    ADD COLUMN "business_license_issuer" TEXT,
    ADD COLUMN "business_license_expires_at" TIMESTAMP(3),
    ADD COLUMN "territory" TEXT,
    ADD COLUMN "consignment_enabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "credit_purchase_enabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "credit_days" INTEGER,
    ADD COLUMN "guarantee_type" TEXT,
    ADD COLUMN "guarantee_amount_rial" DECIMAL(18,0),
    ADD COLUMN "guarantee_reference" TEXT;

-- نمایندگانی که تاکنون شمش امانی گرفته‌اند همچنان مجاز به امانت می‌مانند (عملیات جاری قطع نشود)
UPDATE "agents" a SET "consignment_enabled" = true
WHERE EXISTS (SELECT 1 FROM "agent_stock_movements" m WHERE m."agent_id" = a."id");

-- ── قرارداد: امضای صاحب امضای مجاز شرکت (بند ۱۶-۱) ──
ALTER TABLE "agent_contracts"
    ADD COLUMN "company_signed_at" TIMESTAMP(3),
    ADD COLUMN "company_signed_by_id" UUID,
    ADD COLUMN "company_signer_name" TEXT;
-- قراردادهای امضاشده‌ی قبلی را شرکت خودش صادر کرده بود؛ صدور به‌منزله‌ی تأیید شرکت ثبت می‌شود
UPDATE "agent_contracts"
SET "company_signed_at" = COALESCE("issued_at", "signed_at"),
    "company_signed_by_id" = "issued_by_id"
WHERE "status" = 'SIGNED';

-- ── فروش نماینده: منبع شمش و مدل صورتحساب ──
ALTER TABLE "agent_sales"
    ADD COLUMN "stock_source" "AgentSaleStockSource" NOT NULL DEFAULT 'CONSIGNMENT',
    ADD COLUMN "billed_to_agent" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "agent_invoice_number" TEXT;

-- ── صورتحساب: خریدار می‌تواند نماینده باشد ──
ALTER TABLE "invoices" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "invoices" ADD COLUMN "agent_id" UUID;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_buyer_check"
    CHECK (("user_id" IS NOT NULL) <> ("agent_id" IS NOT NULL));
CREATE INDEX "invoices_agent_id_kind_issued_at_idx" ON "invoices"("agent_id", "kind", "issued_at");
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── کیف پول نماینده ──
CREATE TABLE "agent_wallets" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "balance_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "blocked_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_wallets_pkey" PRIMARY KEY ("id"),
    -- آخرین خط دفاع: مانده هرگز منفی نمی‌شود و رزرو از مانده بیشتر نیست
    CONSTRAINT "agent_wallets_balance_check" CHECK ("balance_rial" >= 0 AND "blocked_rial" >= 0 AND "blocked_rial" <= "balance_rial")
);
CREATE UNIQUE INDEX "agent_wallets_agent_id_key" ON "agent_wallets"("agent_id");
ALTER TABLE "agent_wallets" ADD CONSTRAINT "agent_wallets_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "agent_wallet_transactions" (
    "id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "type" "AgentWalletTxType" NOT NULL,
    "credit_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "debit_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "balance_after_rial" DECIMAL(18,0) NOT NULL,
    "description" TEXT NOT NULL,
    "reference_type" TEXT,
    "reference_id" UUID,
    "reference_number" TEXT,
    "journal_entry_id" UUID,
    "created_by_admin_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_wallet_transactions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "agent_wallet_transactions_agent_id_created_at_idx" ON "agent_wallet_transactions"("agent_id", "created_at");
CREATE INDEX "agent_wallet_transactions_wallet_id_created_at_idx" ON "agent_wallet_transactions"("wallet_id", "created_at");
CREATE INDEX "agent_wallet_transactions_reference_type_reference_id_idx" ON "agent_wallet_transactions"("reference_type", "reference_id");
ALTER TABLE "agent_wallet_transactions" ADD CONSTRAINT "agent_wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "agent_wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── حساب بانکی نماینده ──
CREATE TABLE "agent_bank_accounts" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "bank_name" TEXT NOT NULL,
    "sheba" TEXT NOT NULL,
    "account_number" TEXT,
    "card_number" TEXT,
    "owner_name" TEXT NOT NULL,
    "status" "AgentBankAccountStatus" NOT NULL DEFAULT 'PENDING',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "rejection_reason" TEXT,
    "verified_by_id" UUID,
    "verified_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_bank_accounts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "agent_bank_accounts_agent_id_sheba_key" ON "agent_bank_accounts"("agent_id", "sheba");
CREATE INDEX "agent_bank_accounts_agent_id_status_idx" ON "agent_bank_accounts"("agent_id", "status");
CREATE INDEX "agent_bank_accounts_status_created_at_idx" ON "agent_bank_accounts"("status", "created_at");
ALTER TABLE "agent_bank_accounts" ADD CONSTRAINT "agent_bank_accounts_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── فهرست قیمت نمایندگی ──
CREATE TABLE "agent_price_items" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "weight_grams" DECIMAL(18,4) NOT NULL,
    "purity_karat" "GoldPurityKarat" NOT NULL,
    "premium_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "consumer_premium_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "product_id" UUID,
    "max_per_order" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_price_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "agent_price_items_is_active_sort_order_idx" ON "agent_price_items"("is_active", "sort_order");

-- ── سفارش خرید شمش از شرکت ──
CREATE TABLE "agent_purchase_orders" (
    "id" UUID NOT NULL,
    "order_number" TEXT NOT NULL,
    "agent_id" UUID NOT NULL,
    "status" "AgentPurchaseStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "payment_method" "AgentPurchasePaymentMethod" NOT NULL,
    "total_weight_grams" DECIMAL(18,4) NOT NULL,
    "gold_value_rial" DECIMAL(18,0) NOT NULL,
    "premium_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "total_rial" DECIMAL(18,0) NOT NULL,
    "price_locked_until" TIMESTAMP(3) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "payment_reference" TEXT,
    "proforma_invoice_id" UUID,
    "invoice_id" UUID,
    "delivery_method" TEXT NOT NULL DEFAULT 'IN_PERSON',
    "delivery_address" TEXT,
    "voucher_number" TEXT,
    "approved_at" TIMESTAMP(3),
    "approved_by_id" UUID,
    "delivered_at" TIMESTAMP(3),
    "receipt_confirmed_at" TIMESTAMP(3),
    "receipt_confirmed_by" UUID,
    "credit_due_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "payment_journal_id" UUID,
    "sale_journal_id" UUID,
    "note" TEXT,
    "admin_note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_purchase_orders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "agent_purchase_orders_order_number_key" ON "agent_purchase_orders"("order_number");
CREATE INDEX "agent_purchase_orders_agent_id_status_idx" ON "agent_purchase_orders"("agent_id", "status");
CREATE INDEX "agent_purchase_orders_status_created_at_idx" ON "agent_purchase_orders"("status", "created_at");
ALTER TABLE "agent_purchase_orders" ADD CONSTRAINT "agent_purchase_orders_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "agent_purchase_order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "price_item_id" UUID,
    "title" TEXT NOT NULL,
    "weight_grams" DECIMAL(18,4) NOT NULL,
    "purity_karat" "GoldPurityKarat" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price_per_gram_rial" DECIMAL(18,0) NOT NULL,
    "unit_gold_value_rial" DECIMAL(18,0) NOT NULL,
    "unit_premium_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "unit_price_rial" DECIMAL(18,0) NOT NULL,
    "line_total_rial" DECIMAL(18,0) NOT NULL,

    CONSTRAINT "agent_purchase_order_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "agent_purchase_order_items_order_id_idx" ON "agent_purchase_order_items"("order_id");
ALTER TABLE "agent_purchase_order_items" ADD CONSTRAINT "agent_purchase_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "agent_purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── فروش شمش نماینده به شرکت ──
CREATE TABLE "agent_buyback_orders" (
    "id" UUID NOT NULL,
    "order_number" TEXT NOT NULL,
    "agent_id" UUID NOT NULL,
    "status" "AgentBuybackStatus" NOT NULL DEFAULT 'PENDING_DELIVERY',
    "payout_method" TEXT NOT NULL DEFAULT 'WALLET',
    "bank_account_id" UUID,
    "total_weight_grams" DECIMAL(18,4) NOT NULL,
    "quoted_total_rial" DECIMAL(18,0) NOT NULL,
    "final_total_rial" DECIMAL(18,0),
    "delivery_deadline" TIMESTAMP(3) NOT NULL,
    "agent_invoice_number" TEXT,
    "agent_invoice_date" TIMESTAMP(3),
    "received_at" TIMESTAMP(3),
    "received_by_id" UUID,
    "inspection_note" TEXT,
    "approved_at" TIMESTAMP(3),
    "approved_by_id" UUID,
    "paid_at" TIMESTAMP(3),
    "paid_by_id" UUID,
    "bank_reference" TEXT,
    "rejection_reason" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "voucher_number" TEXT,
    "journal_entry_id" UUID,
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_buyback_orders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "agent_buyback_orders_order_number_key" ON "agent_buyback_orders"("order_number");
CREATE INDEX "agent_buyback_orders_agent_id_status_idx" ON "agent_buyback_orders"("agent_id", "status");
CREATE INDEX "agent_buyback_orders_status_created_at_idx" ON "agent_buyback_orders"("status", "created_at");
ALTER TABLE "agent_buyback_orders" ADD CONSTRAINT "agent_buyback_orders_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_buyback_orders" ADD CONSTRAINT "agent_buyback_orders_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "agent_bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "agent_buyback_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "hologram_code_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "weight_grams" DECIMAL(18,4) NOT NULL,
    "purity_karat" "GoldPurityKarat" NOT NULL,
    "price_per_gram_rial" DECIMAL(18,0) NOT NULL,
    "quoted_rial" DECIMAL(18,0) NOT NULL,
    "final_rial" DECIMAL(18,0),
    "accepted" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,

    CONSTRAINT "agent_buyback_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "agent_buyback_items_order_id_idx" ON "agent_buyback_items"("order_id");
CREATE INDEX "agent_buyback_items_hologram_code_id_idx" ON "agent_buyback_items"("hologram_code_id");
ALTER TABLE "agent_buyback_items" ADD CONSTRAINT "agent_buyback_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "agent_buyback_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── واریز به کیف پول نماینده ──
CREATE TABLE "agent_deposit_requests" (
    "id" UUID NOT NULL,
    "request_number" TEXT NOT NULL,
    "agent_id" UUID NOT NULL,
    "amount_rial" DECIMAL(18,0) NOT NULL,
    "method" "AgentDepositMethod" NOT NULL,
    "status" "AgentDepositStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "transfer_type" TEXT,
    "source_bank_account_id" UUID,
    "bank_reference" TEXT,
    "paid_at" TIMESTAMP(3),
    "agent_note" TEXT,
    "destination_snapshot" JSONB,
    "gateway_provider" "PaymentGatewayProvider",
    "gateway_provider_ref" TEXT,
    "gateway_tracking_code" TEXT,
    "purchase_order_id" UUID,
    "expires_at" TIMESTAMP(3),
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "journal_entry_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_deposit_requests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "agent_deposit_requests_request_number_key" ON "agent_deposit_requests"("request_number");
CREATE UNIQUE INDEX "agent_deposit_requests_gateway_provider_gateway_provider_re_key" ON "agent_deposit_requests"("gateway_provider", "gateway_provider_ref");
CREATE INDEX "agent_deposit_requests_agent_id_status_idx" ON "agent_deposit_requests"("agent_id", "status");
CREATE INDEX "agent_deposit_requests_status_created_at_idx" ON "agent_deposit_requests"("status", "created_at");
-- یک مرجع بانکی فقط یک‌بار قابل ثبت است (ضد ثبت تکراری یک واریز)
CREATE UNIQUE INDEX "agent_deposit_requests_bank_reference_uq" ON "agent_deposit_requests"("bank_reference")
    WHERE "bank_reference" IS NOT NULL AND "status" NOT IN ('REJECTED', 'CANCELLED', 'EXPIRED', 'FAILED');
ALTER TABLE "agent_deposit_requests" ADD CONSTRAINT "agent_deposit_requests_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_deposit_requests" ADD CONSTRAINT "agent_deposit_requests_source_bank_account_id_fkey" FOREIGN KEY ("source_bank_account_id") REFERENCES "agent_bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agent_deposit_requests" ADD CONSTRAINT "agent_deposit_requests_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "agent_purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── برداشت از کیف پول نماینده ──
CREATE TABLE "agent_withdrawal_requests" (
    "id" UUID NOT NULL,
    "request_number" TEXT NOT NULL,
    "agent_id" UUID NOT NULL,
    "amount_rial" DECIMAL(18,0) NOT NULL,
    "bank_account_id" UUID NOT NULL,
    "destination_snapshot" JSONB NOT NULL,
    "status" "AgentWithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "paid_by_id" UUID,
    "paid_at" TIMESTAMP(3),
    "bank_reference" TEXT,
    "rejection_reason" TEXT,
    "journal_entry_id" UUID,
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_withdrawal_requests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "agent_withdrawal_requests_request_number_key" ON "agent_withdrawal_requests"("request_number");
CREATE INDEX "agent_withdrawal_requests_agent_id_status_idx" ON "agent_withdrawal_requests"("agent_id", "status");
CREATE INDEX "agent_withdrawal_requests_status_created_at_idx" ON "agent_withdrawal_requests"("status", "created_at");
ALTER TABLE "agent_withdrawal_requests" ADD CONSTRAINT "agent_withdrawal_requests_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_withdrawal_requests" ADD CONSTRAINT "agent_withdrawal_requests_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "agent_bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
