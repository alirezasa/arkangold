-- دفاتر تجاری الکترونیکی (سازمان امور مالیاتی): سابقه‌ی فایل‌های بارگذاری‌شده برای پیوستگی بازه‌ها

-- CreateEnum
CREATE TYPE "TaxBookMode" AS ENUM ('DOCUMENT', 'MONTHLY');

-- CreateEnum
CREATE TYPE "TaxBookStatus" AS ENUM ('ACTIVE', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "tax_book_exports" (
    "id" UUID NOT NULL,
    "fiscal_year_id" UUID NOT NULL,
    "tracking_code" TEXT NOT NULL,
    "period_start_jalali" TEXT NOT NULL,
    "period_end_jalali" TEXT NOT NULL,
    "period_start" TEXT NOT NULL,
    "period_end" TEXT NOT NULL,
    "mode" "TaxBookMode" NOT NULL,
    "format" TEXT NOT NULL,
    "include_closing" BOOLEAN NOT NULL DEFAULT true,
    "journal_count" INTEGER NOT NULL,
    "record_count" INTEGER NOT NULL,
    "total_debit_rial" DECIMAL(20,0) NOT NULL,
    "total_credit_rial" DECIMAL(20,0) NOT NULL,
    "content_sha256" TEXT NOT NULL,
    "status" "TaxBookStatus" NOT NULL DEFAULT 'ACTIVE',
    "superseded_by_id" UUID,
    "note" TEXT,
    "created_by_admin_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_book_exports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tax_book_exports_fiscal_year_id_status_period_end_idx" ON "tax_book_exports"("fiscal_year_id", "status", "period_end");

-- AddForeignKey
ALTER TABLE "tax_book_exports" ADD CONSTRAINT "tax_book_exports_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

