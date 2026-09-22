-- CreateEnum
CREATE TYPE "ShopOrderItemRecipientType" AS ENUM ('SELF', 'OTHER');

-- CreateEnum
CREATE TYPE "HologramCodeStatus" AS ENUM ('UNASSIGNED', 'ASSIGNED', 'TRANSFER_PENDING', 'REVOKED');

-- CreateEnum
CREATE TYPE "HologramOwnershipStatus" AS ENUM ('ACTIVE', 'TRANSFERRED', 'PENDING_RECIPIENT_CONFIRMATION');

-- CreateEnum
CREATE TYPE "HologramTransferType" AS ENUM ('INITIAL_PURCHASE', 'GIFT_TRANSFER', 'SALE_TRANSFER');

-- CreateEnum
CREATE TYPE "HologramTransferRequestStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HologramInquiryChannel" AS ENUM ('PUBLIC_WEB', 'APP_PANEL', 'API_DIRECT');

-- CreateEnum
CREATE TYPE "HologramInquiryResult" AS ENUM ('VALID_ASSIGNED', 'VALID_UNASSIGNED', 'INVALID_CODE');

-- AlterTable
ALTER TABLE "shop_order_items" ADD COLUMN     "recipient_phone_number" TEXT,
ADD COLUMN     "recipient_type" "ShopOrderItemRecipientType" NOT NULL DEFAULT 'SELF';

-- CreateTable
CREATE TABLE "hologram_batches" (
    "id" UUID NOT NULL,
    "batch_number" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "notes" TEXT,
    "created_by_admin_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hologram_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hologram_codes" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "status" "HologramCodeStatus" NOT NULL DEFAULT 'UNASSIGNED',
    "batch_id" UUID NOT NULL,
    "product_id" UUID,
    "variant_id" UUID,
    "weight_grams" DECIMAL(18,4),
    "purity_karat" "GoldPurityKarat",
    "factory_serial_number" TEXT,
    "minted_at" TIMESTAMP(3),
    "shop_order_item_id" UUID,
    "assigned_by_admin_id" UUID,
    "assigned_at" TIMESTAMP(3),
    "revoked_by_admin_id" UUID,
    "revoked_at" TIMESTAMP(3),
    "revoke_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hologram_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hologram_ownerships" (
    "id" UUID NOT NULL,
    "hologram_code_id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "shop_order_id" UUID,
    "full_name" TEXT NOT NULL,
    "national_code" TEXT NOT NULL,
    "ownership_start_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ownership_end_at" TIMESTAMP(3),
    "status" "HologramOwnershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "transfer_type" "HologramTransferType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hologram_ownerships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ownership_transfer_requests" (
    "id" UUID NOT NULL,
    "hologram_code_id" UUID NOT NULL,
    "initiated_by_user_id" UUID,
    "initiated_by_admin_id" UUID,
    "shop_order_item_id" UUID,
    "recipient_phone_number" TEXT NOT NULL,
    "recipient_user_id" UUID,
    "status" "HologramTransferRequestStatus" NOT NULL DEFAULT 'PENDING',
    "transfer_type" "HologramTransferType" NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "requires_identity_verification" BOOLEAN NOT NULL DEFAULT true,
    "identity_verification_ref" TEXT,
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ownership_transfer_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hologram_inquiry_logs" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "hologram_code_id" UUID,
    "ip_address" TEXT NOT NULL,
    "user_agent" TEXT,
    "channel" "HologramInquiryChannel" NOT NULL,
    "result" "HologramInquiryResult" NOT NULL,
    "user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hologram_inquiry_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hologram_rate_limit_blocks" (
    "id" UUID NOT NULL,
    "ip_address" TEXT NOT NULL,
    "blocked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blocked_until" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "failed_attempts_count" INTEGER NOT NULL DEFAULT 0,
    "unblocked_at" TIMESTAMP(3),
    "unblocked_by_admin_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hologram_rate_limit_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hologram_batches_batch_number_key" ON "hologram_batches"("batch_number");

-- CreateIndex
CREATE UNIQUE INDEX "hologram_codes_code_key" ON "hologram_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "hologram_codes_shop_order_item_id_key" ON "hologram_codes"("shop_order_item_id");

-- CreateIndex
CREATE INDEX "hologram_codes_batch_id_idx" ON "hologram_codes"("batch_id");

-- CreateIndex
CREATE INDEX "hologram_codes_status_idx" ON "hologram_codes"("status");

-- CreateIndex
CREATE INDEX "hologram_ownerships_hologram_code_id_idx" ON "hologram_ownerships"("hologram_code_id");

-- CreateIndex
CREATE INDEX "hologram_ownerships_owner_user_id_idx" ON "hologram_ownerships"("owner_user_id");

-- CreateIndex
CREATE INDEX "ownership_transfer_requests_hologram_code_id_idx" ON "ownership_transfer_requests"("hologram_code_id");

-- CreateIndex
CREATE INDEX "ownership_transfer_requests_recipient_phone_number_status_idx" ON "ownership_transfer_requests"("recipient_phone_number", "status");

-- CreateIndex
CREATE INDEX "ownership_transfer_requests_status_expires_at_idx" ON "ownership_transfer_requests"("status", "expires_at");

-- CreateIndex
CREATE INDEX "hologram_inquiry_logs_ip_address_created_at_idx" ON "hologram_inquiry_logs"("ip_address", "created_at");

-- CreateIndex
CREATE INDEX "hologram_inquiry_logs_code_idx" ON "hologram_inquiry_logs"("code");

-- CreateIndex
CREATE UNIQUE INDEX "hologram_rate_limit_blocks_ip_address_key" ON "hologram_rate_limit_blocks"("ip_address");

-- CreateIndex
CREATE INDEX "hologram_rate_limit_blocks_blocked_until_idx" ON "hologram_rate_limit_blocks"("blocked_until");

-- AddForeignKey
ALTER TABLE "hologram_batches" ADD CONSTRAINT "hologram_batches_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hologram_codes" ADD CONSTRAINT "hologram_codes_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "hologram_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hologram_codes" ADD CONSTRAINT "hologram_codes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hologram_codes" ADD CONSTRAINT "hologram_codes_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hologram_codes" ADD CONSTRAINT "hologram_codes_shop_order_item_id_fkey" FOREIGN KEY ("shop_order_item_id") REFERENCES "shop_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hologram_codes" ADD CONSTRAINT "hologram_codes_assigned_by_admin_id_fkey" FOREIGN KEY ("assigned_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hologram_codes" ADD CONSTRAINT "hologram_codes_revoked_by_admin_id_fkey" FOREIGN KEY ("revoked_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hologram_ownerships" ADD CONSTRAINT "hologram_ownerships_hologram_code_id_fkey" FOREIGN KEY ("hologram_code_id") REFERENCES "hologram_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hologram_ownerships" ADD CONSTRAINT "hologram_ownerships_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hologram_ownerships" ADD CONSTRAINT "hologram_ownerships_shop_order_id_fkey" FOREIGN KEY ("shop_order_id") REFERENCES "shop_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ownership_transfer_requests" ADD CONSTRAINT "ownership_transfer_requests_hologram_code_id_fkey" FOREIGN KEY ("hologram_code_id") REFERENCES "hologram_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ownership_transfer_requests" ADD CONSTRAINT "ownership_transfer_requests_initiated_by_user_id_fkey" FOREIGN KEY ("initiated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ownership_transfer_requests" ADD CONSTRAINT "ownership_transfer_requests_initiated_by_admin_id_fkey" FOREIGN KEY ("initiated_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ownership_transfer_requests" ADD CONSTRAINT "ownership_transfer_requests_shop_order_item_id_fkey" FOREIGN KEY ("shop_order_item_id") REFERENCES "shop_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ownership_transfer_requests" ADD CONSTRAINT "ownership_transfer_requests_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hologram_inquiry_logs" ADD CONSTRAINT "hologram_inquiry_logs_hologram_code_id_fkey" FOREIGN KEY ("hologram_code_id") REFERENCES "hologram_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hologram_inquiry_logs" ADD CONSTRAINT "hologram_inquiry_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hologram_rate_limit_blocks" ADD CONSTRAINT "hologram_rate_limit_blocks_unblocked_by_admin_id_fkey" FOREIGN KEY ("unblocked_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Defense-in-depth: Prisma's schema DSL has no partial-unique-index syntax, so this
-- guarantee (at most one ACTIVE ownership record per hologram code, matching the
-- "single current owner" invariant required by the ownership-transfer state machine)
-- is expressed here directly in SQL, mirroring the double-credit-prevention pattern
-- already used for deposits. The application layer must still enforce this inside a
-- single DB transaction (close the old ACTIVE row and insert the new one together) —
-- this index only prevents a bug or a race from ever producing two ACTIVE rows.
CREATE UNIQUE INDEX "hologram_ownerships_one_active_per_code" ON "hologram_ownerships"("hologram_code_id") WHERE "status" = 'ACTIVE';

-- Defense-in-depth: at most one non-final (PENDING) transfer request may exist per
-- hologram code at a time, so a code cannot be double-offered while a transfer is
-- awaiting recipient confirmation.
CREATE UNIQUE INDEX "ownership_transfer_requests_one_pending_per_code" ON "ownership_transfer_requests"("hologram_code_id") WHERE "status" = 'PENDING';
