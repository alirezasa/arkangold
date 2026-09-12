-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_FOR_USER', 'RESOLVED', 'CLOSED', 'REOPENED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TicketSenderType" AS ENUM ('USER', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('INVOICE', 'PROFORMA');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'PAID', 'CONSUMED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceSource" AS ENUM ('SHOP_ORDER', 'PHYSICAL_DELIVERY', 'DEPOSIT');

-- CreateEnum
CREATE TYPE "DepositMethod" AS ENUM ('ONLINE', 'CARD_TO_CARD', 'BANK_TRANSFER', 'TRACKING_ID', 'LARGE_TRANSFER', 'DIRECT');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('PENDING_PAYMENT', 'RECEIPT_UPLOADED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('REAL', 'LEGAL');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BANNED', 'PENDING_ACTIVATION');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('REGISTER', 'LOGIN', 'RESET_PASSWORD');

-- CreateEnum
CREATE TYPE "IdentityStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "HoldType" AS ENUM ('ORDER', 'WITHDRAWAL', 'PHYSICAL_DELIVERY');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('BUY_GOLD', 'SELL_GOLD', 'BUY_SILVER', 'SELL_SILVER', 'TRANSFER_IN', 'TRANSFER_OUT', 'WITHDRAWAL', 'DEPOSIT', 'FEE', 'TAX', 'REFERRAL_REWARD', 'SALARY', 'PHYSICAL_DELIVERY', 'SHOP_PURCHASE', 'REFUND', 'MANUAL_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "LedgerSide" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "MetalType" AS ENUM ('GOLD', 'SILVER');

-- CreateEnum
CREATE TYPE "OrderSide" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'OUT_OF_STOCK');

-- CreateEnum
CREATE TYPE "ShopOrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('WALLET', 'BANK_GATEWAY');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PROCESSED');

-- CreateEnum
CREATE TYPE "ApprovalType" AS ENUM ('WITHDRAWAL', 'PHYSICAL_DELIVERY', 'MANUAL_TRANSACTION', 'DEPOSIT');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "FeeType" AS ENUM ('BUY_GOLD', 'SELL_GOLD', 'TRANSFER', 'PHYSICAL_DELIVERY', 'WITHDRAWAL');

-- CreateEnum
CREATE TYPE "TaxType" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "PhysicalDeliveryStatus" AS ENUM ('PENDING', 'APPROVED', 'SHIPPED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ShippingStatus" AS ENUM ('IN_TRANSIT', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "VaultInventoryType" AS ENUM ('PHYSICAL', 'RESERVED', 'IN_TRANSIT');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'SETTLED', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SMS', 'IN_APP', 'EMAIL');

-- CreateEnum
CREATE TYPE "LegalProfileStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProductPricingMode" AS ENUM ('FIXED', 'WEIGHT_RANGE');

-- CreateEnum
CREATE TYPE "PricingComponentBase" AS ENUM ('GOLD_VALUE', 'RUNNING_TOTAL', 'FIXED');

-- CreateEnum
CREATE TYPE "PricingComponentValueType" AS ENUM ('PERCENT', 'FIXED_RIAL');

-- CreateEnum
CREATE TYPE "GoldPurityKarat" AS ENUM ('K18', 'K24');

-- CreateEnum
CREATE TYPE "PaymentGatewayProvider" AS ENUM ('ZARINPAL', 'BEHPARDAKHT');

-- CreateTable
CREATE TABLE "users" (
    "phone" TEXT NOT NULL,
    "password_hash" TEXT,
    "type" "UserType" NOT NULL DEFAULT 'REAL',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "referral_code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "id" UUID NOT NULL,
    "referred_by_id" UUID,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_otps" (
    "phone" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "purpose" "OtpPurpose" NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" UUID NOT NULL,

    CONSTRAINT "user_otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "device" TEXT,
    "ip" TEXT,
    "refresh_token_hash" TEXT NOT NULL,
    "access_token_hash" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_identities" (
    "first_name" TEXT,
    "last_name" TEXT,
    "national_code" TEXT,
    "birth_date" TIMESTAMP(3),
    "status" "IdentityStatus" NOT NULL DEFAULT 'PENDING',
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "user_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_profiles" (
    "company_name" TEXT NOT NULL,
    "national_id" TEXT NOT NULL,
    "economic_code" TEXT,
    "registration_number" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "status" "LegalProfileStatus" NOT NULL DEFAULT 'PENDING',
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "representative_id" UUID,

    CONSTRAINT "legal_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_profile_documents" (
    "id" UUID NOT NULL,
    "legal_profile_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_profile_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "bank_name" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "card_number" TEXT NOT NULL,
    "sheba" TEXT,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "gold_balance_grams" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "rial_balance" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "card_number" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_holds" (
    "amount_grams" DECIMAL(18,4),
    "amount_rial" DECIMAL(18,0),
    "hold_type" "HoldType" NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "reference_id" UUID,

    CONSTRAINT "wallet_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "type" "TransactionType" NOT NULL,
    "amountGrams" DECIMAL(18,4),
    "amountRial" DECIMAL(18,0),
    "price_per_gram" DECIMAL(18,0),
    "fee_amount" DECIMAL(18,0),
    "tax_amount" DECIMAL(18,0),
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "physical_delivery_id" UUID,
    "shop_order_id" UUID,
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "related_transaction_id" UUID,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "sub_type" TEXT,
    "balance_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "balance_grams" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "id" UUID NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "description" TEXT,
    "total_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "total_grams" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "entry_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" UUID NOT NULL,
    "transaction_id" UUID,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "side" "LedgerSide" NOT NULL,
    "amount_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "amount_grams" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" UUID NOT NULL,
    "journal_entry_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_prices" (
    "metal" "MetalType" NOT NULL,
    "price_per_gram_rial" DECIMAL(18,0) NOT NULL,
    "source" TEXT,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" UUID NOT NULL,

    CONSTRAINT "market_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_history" (
    "metal" "MetalType" NOT NULL,
    "price_per_gram_rial" DECIMAL(18,0) NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" UUID NOT NULL,

    CONSTRAINT "price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_locks" (
    "metal" "MetalType" NOT NULL,
    "amount_grams" DECIMAL(18,4) NOT NULL,
    "side" "OrderSide" NOT NULL,
    "locked_price" DECIMAL(18,0) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fee_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "tax_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "price_locks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "metal" "MetalType" NOT NULL,
    "side" "OrderSide" NOT NULL,
    "amount_grams" DECIMAL(18,4) NOT NULL,
    "price_per_gram" DECIMAL(18,0) NOT NULL,
    "total_rial" DECIMAL(18,0) NOT NULL,
    "fee" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "tax" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "lock_id" UUID,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_components" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pricing_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_pricing_components" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "component_id" UUID NOT NULL,
    "base_type" "PricingComponentBase" NOT NULL,
    "value_type" "PricingComponentValueType" NOT NULL,
    "value" DECIMAL(18,4) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_pricing_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" UUID NOT NULL,
    "parent_id" UUID,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "base_price_rial" DECIMAL(18,0) NOT NULL,
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "seo_title" TEXT,
    "seo_desc" TEXT,
    "pricing_mode" "ProductPricingMode" NOT NULL DEFAULT 'FIXED',
    "min_weight_grams" DECIMAL(18,4),
    "max_weight_grams" DECIMAL(18,4),
    "weight_step_grams" DECIMAL(18,4) DEFAULT 0.1,
    "price_per_gram_rial" DECIMAL(18,0),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "purity_karat" "GoldPurityKarat",
    "short_description" TEXT,
    "meta_keywords" TEXT,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "weight_grams" DECIMAL(18,4) NOT NULL,
    "price_adjustment" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "stock_quantity" INTEGER NOT NULL DEFAULT 0,
    "sku" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "alt_text" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carts" (
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "variant_id" UUID,
    "product_id" UUID,
    "selected_weight_grams" DECIMAL(18,4),
    "locked_unit_price_rial" DECIMAL(18,0),
    "locked_breakdown" JSONB,
    "price_locked_at" TIMESTAMP(3),
    "price_expires_at" TIMESTAMP(3),

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_orders" (
    "status" "ShopOrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "total_rial" DECIMAL(18,0) NOT NULL,
    "tracking_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "address_id" UUID NOT NULL,

    CONSTRAINT "shop_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_order_items" (
    "quantity" INTEGER NOT NULL,
    "price_rial" DECIMAL(18,0) NOT NULL,
    "selected_weight_grams" DECIMAL(18,4),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "variant_id" UUID,
    "product_id" UUID,
    "price_breakdown" JSONB,

    CONSTRAINT "shop_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "amount_rial" DECIMAL(18,0) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "reference_code" TEXT,
    "gateway_provider" "PaymentGatewayProvider",
    "gateway_provider_ref" TEXT,
    "gateway_tracking_code" TEXT,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "order_id" UUID,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawal_requests" (
    "amount_rial" DECIMAL(18,0) NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "admin_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "bank_account_id" UUID NOT NULL,
    "processed_by_id" UUID,

    CONSTRAINT "withdrawal_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approvals" (
    "request_type" "ApprovalType" NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 1,
    "status" "ApprovalStatus" NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "physical_delivery_request_id" UUID,
    "withdrawal_request_id" UUID,
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "approver_id" UUID NOT NULL,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_limits" (
    "daily_buy_limit_grams" DECIMAL(18,4) NOT NULL DEFAULT 50,
    "daily_sell_limit_grams" DECIMAL(18,4) NOT NULL DEFAULT 50,
    "monthly_withdraw_limit_rial" DECIMAL(18,0) NOT NULL DEFAULT 500000000,
    "daily_transfer_limit_grams" DECIMAL(18,4) NOT NULL DEFAULT 100,
    "physical_delivery_min_grams" DECIMAL(18,4) NOT NULL DEFAULT 1,
    "physical_delivery_max_grams" DECIMAL(18,4) NOT NULL DEFAULT 500,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "user_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_configs" (
    "type" "FeeType" NOT NULL,
    "fee_percent" DECIMAL(5,2) NOT NULL,
    "fee_fixed_rial" DECIMAL(18,0),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "id" UUID NOT NULL,
    "user_id" UUID,

    CONSTRAINT "fee_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_configs" (
    "type" "TaxType" NOT NULL,
    "tax_percent" DECIMAL(5,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "id" UUID NOT NULL,
    "user_id" UUID,

    CONSTRAINT "tax_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "reward_claimed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" UUID NOT NULL,
    "referrer_id" UUID NOT NULL,
    "referred_id" UUID NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_rewards" (
    "amount_grams" DECIMAL(18,4),
    "amount_rial" DECIMAL(18,0),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "referral_id" UUID NOT NULL,
    "transaction_id" UUID,

    CONSTRAINT "referral_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "title" TEXT,
    "province" TEXT,
    "city" TEXT,
    "postal_code" TEXT,
    "full_address" TEXT NOT NULL,
    "receiver_name" TEXT,
    "receiver_phone" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "physical_delivery_requests" (
    "amount_grams" DECIMAL(18,4) NOT NULL,
    "fee_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "status" "PhysicalDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "tracking_code" TEXT,
    "admin_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "address_id" UUID NOT NULL,
    "approved_by_id" UUID,

    CONSTRAINT "physical_delivery_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shippings" (
    "carrier_name" TEXT,
    "tracking_code" TEXT,
    "estimated_delivery" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "status" "ShippingStatus" NOT NULL DEFAULT 'IN_TRANSIT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" UUID NOT NULL,
    "delivery_request_id" UUID,
    "shop_order_id" UUID,

    CONSTRAINT "shippings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_plans" (
    "name" TEXT NOT NULL,
    "amount_grams" DECIMAL(18,4) NOT NULL,
    "execution_day" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,

    CONSTRAINT "payroll_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_plan_users" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "payroll_plan_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_logs" (
    "execution_date" TIMESTAMP(3) NOT NULL,
    "status" "PayrollStatus" NOT NULL,
    "total_users" INTEGER NOT NULL,
    "successful" INTEGER NOT NULL,
    "failed" INTEGER NOT NULL,
    "details" JSONB,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,

    CONSTRAINT "payroll_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "old_value" JSONB,
    "new_value" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" UUID NOT NULL,
    "user_id" UUID,
    "admin_id" UUID,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_configs" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "id" UUID NOT NULL,

    CONSTRAINT "system_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vault_gold_inventory" (
    "type" "VaultInventoryType" NOT NULL,
    "amount_grams" DECIMAL(18,4) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" UUID NOT NULL,
    "reference_id" UUID,

    CONSTRAINT "vault_gold_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_logs" (
    "bank_transaction_id" TEXT NOT NULL,
    "amount_rial" DECIMAL(18,0) NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'PENDING',
    "settled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" UUID NOT NULL,
    "user_id" UUID,

    CONSTRAINT "settlement_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "type" "NotificationType" NOT NULL,
    "content" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "totp_secret" TEXT,
    "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "totp_enabled_at" TIMESTAMP(3),
    "backup_codes_hash" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "last_login_ip" TEXT,
    "role_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" UUID,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_roles" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_permissions" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "admin_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "admin_role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "admin_sessions" (
    "id" UUID NOT NULL,
    "admin_user_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" UUID NOT NULL,
    "admin_user_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "old_value" JSONB,
    "new_value" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_sequences" (
    "key" TEXT NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "kind" "InvoiceKind" NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "source_type" "InvoiceSource" NOT NULL,
    "source_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "company_snapshot" JSONB NOT NULL,
    "customer_snapshot" JSONB NOT NULL,
    "extra_data" JSONB,
    "subtotal_rial" DECIMAL(18,0) NOT NULL,
    "discount_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "fee_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "tax_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "total_rial" DECIMAL(18,0) NOT NULL,
    "total_in_words" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "content_hash" TEXT NOT NULL,
    "pdf_storage_key" TEXT,
    "signed_at" TIMESTAMP(3),
    "signature_payload" TEXT,
    "tax_authority_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "row_no" INTEGER NOT NULL,
    "product_code" TEXT,
    "title" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "purity_karat" TEXT,
    "quantity" DECIMAL(18,4) NOT NULL,
    "weight_grams" DECIMAL(18,4),
    "unit_price_rial" DECIMAL(18,0) NOT NULL,
    "discount_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "making_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "fee_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "total_rial" DECIMAL(18,0) NOT NULL,
    "meta" JSONB,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposit_requests" (
    "id" UUID NOT NULL,
    "request_number" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "amount_rial" DECIMAL(18,0) NOT NULL,
    "method" "DepositMethod" NOT NULL,
    "status" "DepositStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "deposit_tracking_id" TEXT NOT NULL,
    "destination_snapshot" JSONB NOT NULL,
    "proforma_invoice_id" UUID,
    "transaction_id" UUID,
    "idempotency_key" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "review_started_at" TIMESTAMP(3),
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "rejection_count" INTEGER NOT NULL DEFAULT 0,
    "admin_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deposit_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposit_receipts" (
    "id" UUID NOT NULL,
    "deposit_request_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "checksum_sha256" TEXT NOT NULL,
    "user_note" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposit_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_providers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_services" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_provider_services" (
    "id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "is_fallback" BOOLEAN NOT NULL DEFAULT false,
    "configuration" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_provider_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_provider_credentials" (
    "id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "encrypted_value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_provider_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_logs" (
    "id" UUID NOT NULL,
    "request_id" TEXT NOT NULL,
    "provider_id" UUID,
    "service_id" UUID,
    "status" TEXT NOT NULL,
    "http_status" INTEGER,
    "provider_request_id" TEXT,
    "error_code" TEXT,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ticket_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "categoryId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" "TicketPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "assignedAdminId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedBy" TEXT,
    "closedReason" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_messages" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "userId" UUID,
    "adminId" UUID,
    "senderType" "TicketSenderType" NOT NULL,
    "message" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_attachments" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "messageId" TEXT,
    "userId" UUID NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "extension" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "ticket_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_assignments" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "assignedAdminId" UUID NOT NULL,
    "assignedBy" TEXT NOT NULL,
    "assignmentReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_status_history" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "oldStatus" "TicketStatus",
    "newStatus" "TicketStatus" NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changedByType" "TicketSenderType" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_activity_logs" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "userId" TEXT,
    "adminId" TEXT,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_ratings" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_referral_code_key" ON "users"("referral_code");

-- CreateIndex
CREATE INDEX "user_otps_phone_purpose_idx" ON "user_otps"("phone", "purpose");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_identities_national_code_key" ON "user_identities"("national_code");

-- CreateIndex
CREATE UNIQUE INDEX "user_identities_user_id_key" ON "user_identities"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "legal_profiles_national_id_key" ON "legal_profiles"("national_id");

-- CreateIndex
CREATE UNIQUE INDEX "legal_profiles_user_id_key" ON "legal_profiles"("user_id");

-- CreateIndex
CREATE INDEX "legal_profile_documents_legal_profile_id_idx" ON "legal_profile_documents"("legal_profile_id");

-- CreateIndex
CREATE INDEX "bank_accounts_user_id_idx" ON "bank_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_card_number_key" ON "wallets"("card_number");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets"("user_id");

-- CreateIndex
CREATE INDEX "wallet_holds_wallet_id_idx" ON "wallet_holds"("wallet_id");

-- CreateIndex
CREATE INDEX "wallet_holds_expires_at_idx" ON "wallet_holds"("expires_at");

-- CreateIndex
CREATE INDEX "transactions_user_id_idx" ON "transactions"("user_id");

-- CreateIndex
CREATE INDEX "transactions_wallet_id_idx" ON "transactions"("wallet_id");

-- CreateIndex
CREATE INDEX "transactions_user_id_type_status_created_at_idx" ON "transactions"("user_id", "type", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_code_key" ON "accounts"("code");

-- CreateIndex
CREATE INDEX "ledger_entries_account_id_idx" ON "ledger_entries"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "market_prices_metal_key" ON "market_prices"("metal");

-- CreateIndex
CREATE INDEX "price_history_metal_recorded_at_idx" ON "price_history"("metal", "recorded_at");

-- CreateIndex
CREATE INDEX "price_locks_user_id_used_idx" ON "price_locks"("user_id", "used");

-- CreateIndex
CREATE INDEX "price_locks_used_expires_at_idx" ON "price_locks"("used", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_lock_id_key" ON "orders"("lock_id");

-- CreateIndex
CREATE INDEX "orders_user_id_status_created_at_idx" ON "orders"("user_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_components_key_key" ON "pricing_components"("key");

-- CreateIndex
CREATE INDEX "product_pricing_components_product_id_sort_order_idx" ON "product_pricing_components"("product_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_slug_key" ON "product_categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants"("sku");

-- CreateIndex
CREATE INDEX "product_images_product_id_idx" ON "product_images"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "carts_user_id_key" ON "carts"("user_id");

-- CreateIndex
CREATE INDEX "cart_items_price_expires_at_idx" ON "cart_items"("price_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "cart_items_cart_id_variant_id_key" ON "cart_items"("cart_id", "variant_id");

-- CreateIndex
CREATE INDEX "shop_orders_user_id_idx" ON "shop_orders"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_reference_code_key" ON "payments"("reference_code");

-- CreateIndex
CREATE INDEX "payments_user_id_idx" ON "payments"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_gateway_provider_gateway_provider_ref_key" ON "payments"("gateway_provider", "gateway_provider_ref");

-- CreateIndex
CREATE INDEX "withdrawal_requests_user_id_status_idx" ON "withdrawal_requests"("user_id", "status");

-- CreateIndex
CREATE INDEX "approvals_request_type_request_id_idx" ON "approvals"("request_type", "request_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_limits_user_id_key" ON "user_limits"("user_id");

-- CreateIndex
CREATE INDEX "fee_configs_type_is_active_idx" ON "fee_configs"("type", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_referred_id_key" ON "referrals"("referred_id");

-- CreateIndex
CREATE INDEX "referrals_referrer_id_idx" ON "referrals"("referrer_id");

-- CreateIndex
CREATE INDEX "addresses_user_id_idx" ON "addresses"("user_id");

-- CreateIndex
CREATE INDEX "physical_delivery_requests_user_id_status_idx" ON "physical_delivery_requests"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_plan_users_plan_id_user_id_key" ON "payroll_plan_users"("plan_id", "user_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_admin_id_idx" ON "audit_logs"("admin_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "system_configs_key_key" ON "system_configs"("key");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_logs_bank_transaction_id_key" ON "settlement_logs"("bank_transaction_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_username_key" ON "admin_users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "admin_roles_key_key" ON "admin_roles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "admin_permissions_key_key" ON "admin_permissions"("key");

-- CreateIndex
CREATE INDEX "admin_sessions_admin_user_id_idx" ON "admin_sessions"("admin_user_id");

-- CreateIndex
CREATE INDEX "admin_audit_logs_admin_user_id_idx" ON "admin_audit_logs"("admin_user_id");

-- CreateIndex
CREATE INDEX "admin_audit_logs_entity_type_entity_id_idx" ON "admin_audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "invoices_user_id_kind_issued_at_idx" ON "invoices"("user_id", "kind", "issued_at");

-- CreateIndex
CREATE INDEX "invoices_status_issued_at_idx" ON "invoices"("status", "issued_at");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_source_type_source_id_kind_key" ON "invoices"("source_type", "source_id", "kind");

-- CreateIndex
CREATE INDEX "invoice_items_invoice_id_row_no_idx" ON "invoice_items"("invoice_id", "row_no");

-- CreateIndex
CREATE UNIQUE INDEX "deposit_requests_request_number_key" ON "deposit_requests"("request_number");

-- CreateIndex
CREATE UNIQUE INDEX "deposit_requests_deposit_tracking_id_key" ON "deposit_requests"("deposit_tracking_id");

-- CreateIndex
CREATE UNIQUE INDEX "deposit_requests_proforma_invoice_id_key" ON "deposit_requests"("proforma_invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "deposit_requests_transaction_id_key" ON "deposit_requests"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "deposit_requests_idempotency_key_key" ON "deposit_requests"("idempotency_key");

-- CreateIndex
CREATE INDEX "deposit_requests_user_id_status_idx" ON "deposit_requests"("user_id", "status");

-- CreateIndex
CREATE INDEX "deposit_requests_status_created_at_idx" ON "deposit_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "deposit_requests_expires_at_idx" ON "deposit_requests"("expires_at");

-- CreateIndex
CREATE INDEX "deposit_receipts_deposit_request_id_idx" ON "deposit_receipts"("deposit_request_id");

-- CreateIndex
CREATE INDEX "deposit_receipts_checksum_sha256_idx" ON "deposit_receipts"("checksum_sha256");

-- CreateIndex
CREATE UNIQUE INDEX "integration_providers_code_key" ON "integration_providers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "integration_services_code_key" ON "integration_services"("code");

-- CreateIndex
CREATE INDEX "integration_provider_services_service_id_is_active_priority_idx" ON "integration_provider_services"("service_id", "is_active", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "integration_provider_services_provider_id_service_id_key" ON "integration_provider_services"("provider_id", "service_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_provider_credentials_provider_id_key_key" ON "integration_provider_credentials"("provider_id", "key");

-- CreateIndex
CREATE INDEX "integration_logs_request_id_idx" ON "integration_logs"("request_id");

-- CreateIndex
CREATE INDEX "integration_logs_provider_id_created_at_idx" ON "integration_logs"("provider_id", "created_at");

-- CreateIndex
CREATE INDEX "integration_logs_service_id_created_at_idx" ON "integration_logs"("service_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_categories_slug_key" ON "ticket_categories"("slug");

-- CreateIndex
CREATE INDEX "ticket_categories_isActive_idx" ON "ticket_categories"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_ticketNumber_key" ON "tickets"("ticketNumber");

-- CreateIndex
CREATE INDEX "tickets_userId_idx" ON "tickets"("userId");

-- CreateIndex
CREATE INDEX "tickets_status_idx" ON "tickets"("status");

-- CreateIndex
CREATE INDEX "tickets_categoryId_idx" ON "tickets"("categoryId");

-- CreateIndex
CREATE INDEX "tickets_assignedAdminId_idx" ON "tickets"("assignedAdminId");

-- CreateIndex
CREATE INDEX "tickets_createdAt_idx" ON "tickets"("createdAt");

-- CreateIndex
CREATE INDEX "tickets_userId_status_idx" ON "tickets"("userId", "status");

-- CreateIndex
CREATE INDEX "ticket_messages_ticketId_idx" ON "ticket_messages"("ticketId");

-- CreateIndex
CREATE INDEX "ticket_messages_ticketId_isInternal_idx" ON "ticket_messages"("ticketId", "isInternal");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_attachments_storageKey_key" ON "ticket_attachments"("storageKey");

-- CreateIndex
CREATE INDEX "ticket_attachments_ticketId_idx" ON "ticket_attachments"("ticketId");

-- CreateIndex
CREATE INDEX "ticket_attachments_messageId_idx" ON "ticket_attachments"("messageId");

-- CreateIndex
CREATE INDEX "ticket_assignments_ticketId_idx" ON "ticket_assignments"("ticketId");

-- CreateIndex
CREATE INDEX "ticket_status_history_ticketId_idx" ON "ticket_status_history"("ticketId");

-- CreateIndex
CREATE INDEX "ticket_activity_logs_ticketId_idx" ON "ticket_activity_logs"("ticketId");

-- CreateIndex
CREATE INDEX "ticket_activity_logs_action_idx" ON "ticket_activity_logs"("action");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_ratings_ticketId_key" ON "ticket_ratings"("ticketId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_referred_by_id_fkey" FOREIGN KEY ("referred_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_profiles" ADD CONSTRAINT "legal_profiles_representative_id_fkey" FOREIGN KEY ("representative_id") REFERENCES "user_identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_profiles" ADD CONSTRAINT "legal_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_profile_documents" ADD CONSTRAINT "legal_profile_documents_legal_profile_id_fkey" FOREIGN KEY ("legal_profile_id") REFERENCES "legal_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_holds" ADD CONSTRAINT "wallet_holds_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_physical_delivery_id_fkey" FOREIGN KEY ("physical_delivery_id") REFERENCES "physical_delivery_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_related_transaction_id_fkey" FOREIGN KEY ("related_transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_shop_order_id_fkey" FOREIGN KEY ("shop_order_id") REFERENCES "shop_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_locks" ADD CONSTRAINT "price_locks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_lock_id_fkey" FOREIGN KEY ("lock_id") REFERENCES "price_locks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_pricing_components" ADD CONSTRAINT "product_pricing_components_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_pricing_components" ADD CONSTRAINT "product_pricing_components_component_id_fkey" FOREIGN KEY ("component_id") REFERENCES "pricing_components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "addresses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_order_items" ADD CONSTRAINT "shop_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "shop_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_order_items" ADD CONSTRAINT "shop_order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_order_items" ADD CONSTRAINT "shop_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "shop_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_processed_by_id_fkey" FOREIGN KEY ("processed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_physical_delivery_request_id_fkey" FOREIGN KEY ("physical_delivery_request_id") REFERENCES "physical_delivery_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_withdrawal_request_id_fkey" FOREIGN KEY ("withdrawal_request_id") REFERENCES "withdrawal_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_limits" ADD CONSTRAINT "user_limits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_configs" ADD CONSTRAINT "fee_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_configs" ADD CONSTRAINT "tax_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_id_fkey" FOREIGN KEY ("referred_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "referrals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_delivery_requests" ADD CONSTRAINT "physical_delivery_requests_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "addresses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_delivery_requests" ADD CONSTRAINT "physical_delivery_requests_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_delivery_requests" ADD CONSTRAINT "physical_delivery_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shippings" ADD CONSTRAINT "shippings_delivery_request_id_fkey" FOREIGN KEY ("delivery_request_id") REFERENCES "physical_delivery_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shippings" ADD CONSTRAINT "shippings_shop_order_id_fkey" FOREIGN KEY ("shop_order_id") REFERENCES "shop_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_plans" ADD CONSTRAINT "payroll_plans_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_plan_users" ADD CONSTRAINT "payroll_plan_users_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "payroll_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_plan_users" ADD CONSTRAINT "payroll_plan_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_logs" ADD CONSTRAINT "payroll_logs_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "payroll_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_logs" ADD CONSTRAINT "settlement_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "admin_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_role_permissions" ADD CONSTRAINT "admin_role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "admin_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_role_permissions" ADD CONSTRAINT "admin_role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "admin_permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_requests" ADD CONSTRAINT "deposit_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_requests" ADD CONSTRAINT "deposit_requests_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_requests" ADD CONSTRAINT "deposit_requests_proforma_invoice_id_fkey" FOREIGN KEY ("proforma_invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_requests" ADD CONSTRAINT "deposit_requests_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_receipts" ADD CONSTRAINT "deposit_receipts_deposit_request_id_fkey" FOREIGN KEY ("deposit_request_id") REFERENCES "deposit_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_provider_services" ADD CONSTRAINT "integration_provider_services_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "integration_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_provider_services" ADD CONSTRAINT "integration_provider_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "integration_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_provider_credentials" ADD CONSTRAINT "integration_provider_credentials_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "integration_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_logs" ADD CONSTRAINT "integration_logs_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "integration_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_logs" ADD CONSTRAINT "integration_logs_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "integration_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ticket_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignedAdminId_fkey" FOREIGN KEY ("assignedAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ticket_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_assignments" ADD CONSTRAINT "ticket_assignments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_status_history" ADD CONSTRAINT "ticket_status_history_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_activity_logs" ADD CONSTRAINT "ticket_activity_logs_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_ratings" ADD CONSTRAINT "ticket_ratings_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
