-- بازخرید شمش: فروش شمش آرکان گلد توسط مالک به خود آرکان گلد (درخواست + تاریخچه‌ی وضعیت)
-- CreateEnum
CREATE TYPE "BullionBuybackStatus" AS ENUM ('SUBMITTED', 'AWAITING_DELIVERY', 'RECEIVED', 'INSPECTION_PASSED', 'OFFERED', 'ACCEPTED', 'APPROVED', 'PAID', 'RETURN_PENDING', 'RETURNED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BuybackDeliveryMethod" AS ENUM ('IN_PERSON', 'INSURED_POST');

-- AlterEnum
ALTER TYPE "HologramCodeStatus" ADD VALUE 'BUYBACK_PENDING';

-- CreateTable
CREATE TABLE "bullion_buyback_requests" (
    "id" UUID NOT NULL,
    "request_number" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "hologram_code_id" UUID NOT NULL,
    "ownership_id" UUID NOT NULL,
    "status" "BullionBuybackStatus" NOT NULL DEFAULT 'SUBMITTED',
    "declared_weight_grams" DECIMAL(18,4) NOT NULL,
    "purity_karat" "GoldPurityKarat",
    "product_title" TEXT,
    "owner_full_name" TEXT NOT NULL,
    "owner_national_code" TEXT NOT NULL,
    "delivery_method" "BuybackDeliveryMethod" NOT NULL,
    "user_note" TEXT,
    "estimated_price_rial" DECIMAL(18,0) NOT NULL,
    "bank_account_id" UUID NOT NULL,
    "destination_snapshot" JSONB NOT NULL,
    "reviewed_by_admin_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "appointment_at" TIMESTAMP(3),
    "appointment_note" TEXT,
    "received_by_admin_id" UUID,
    "received_at" TIMESTAMP(3),
    "receipt_note" TEXT,
    "inspected_by_admin_id" UUID,
    "inspected_at" TIMESTAMP(3),
    "inspection_passed" BOOLEAN,
    "inspection_checklist" JSONB,
    "measured_weight_grams" DECIMAL(18,4),
    "measured_fineness" DECIMAL(6,1),
    "inspection_note" TEXT,
    "offered_by_admin_id" UUID,
    "offered_at" TIMESTAMP(3),
    "offer_expires_at" TIMESTAMP(3),
    "offer_price_per_gram_rial" DECIMAL(18,0),
    "offer_gross_rial" DECIMAL(18,0),
    "offer_deduction_rial" DECIMAL(18,0),
    "offer_fee_rial" DECIMAL(18,0),
    "offer_net_rial" DECIMAL(18,0),
    "offer_note" TEXT,
    "accepted_at" TIMESTAMP(3),
    "approved_by_admin_id" UUID,
    "approved_at" TIMESTAMP(3),
    "paid_by_admin_id" UUID,
    "paid_at" TIMESTAMP(3),
    "payout_method" TEXT,
    "bank_reference" TEXT,
    "source_account_code" TEXT,
    "journal_entry_id" UUID,
    "rejection_reason" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "return_reason" TEXT,
    "returned_at" TIMESTAMP(3),
    "returned_by_admin_id" UUID,
    "return_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bullion_buyback_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bullion_buyback_events" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "from_status" "BullionBuybackStatus",
    "to_status" "BullionBuybackStatus" NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_user_id" UUID,
    "actor_admin_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bullion_buyback_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bullion_buyback_requests_request_number_key" ON "bullion_buyback_requests"("request_number");

-- CreateIndex
CREATE INDEX "bullion_buyback_requests_user_id_created_at_idx" ON "bullion_buyback_requests"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "bullion_buyback_requests_status_created_at_idx" ON "bullion_buyback_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "bullion_buyback_requests_hologram_code_id_idx" ON "bullion_buyback_requests"("hologram_code_id");

-- CreateIndex
CREATE INDEX "bullion_buyback_events_request_id_created_at_idx" ON "bullion_buyback_events"("request_id", "created_at");

-- AddForeignKey
ALTER TABLE "bullion_buyback_requests" ADD CONSTRAINT "bullion_buyback_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bullion_buyback_requests" ADD CONSTRAINT "bullion_buyback_requests_hologram_code_id_fkey" FOREIGN KEY ("hologram_code_id") REFERENCES "hologram_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bullion_buyback_requests" ADD CONSTRAINT "bullion_buyback_requests_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bullion_buyback_events" ADD CONSTRAINT "bullion_buyback_events_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "bullion_buyback_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- در هر لحظه حداکثر یک درخواست بازخرید باز برای هر شمش مجاز است
CREATE UNIQUE INDEX "bullion_buyback_requests_open_per_code_key"
  ON "bullion_buyback_requests"("hologram_code_id")
  WHERE "status" NOT IN ('PAID', 'RETURNED', 'REJECTED', 'CANCELLED');
