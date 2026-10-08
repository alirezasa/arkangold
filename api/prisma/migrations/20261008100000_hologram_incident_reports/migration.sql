-- گزارش سرقت/مفقودی شمش + ردپای استعلام‌های پنل ادمین/پرتال نماینده

-- CreateEnum
CREATE TYPE "HologramIncidentType" AS ENUM ('THEFT', 'LOSS');

-- CreateEnum
CREATE TYPE "HologramIncidentStatus" AS ENUM ('OPEN', 'CONFIRMED', 'RECOVERED', 'REJECTED', 'CANCELLED');

-- AlterEnum


ALTER TYPE "HologramInquiryChannel" ADD VALUE 'ADMIN_PANEL';
ALTER TYPE "HologramInquiryChannel" ADD VALUE 'AGENT_PORTAL';

-- AlterTable
ALTER TABLE "hologram_inquiry_logs" ADD COLUMN     "admin_user_id" UUID,
ADD COLUMN     "incident_report_id" UUID;

-- CreateTable
CREATE TABLE "hologram_incident_reports" (
    "id" UUID NOT NULL,
    "report_number" TEXT NOT NULL,
    "hologram_code_id" UUID NOT NULL,
    "type" "HologramIncidentType" NOT NULL,
    "status" "HologramIncidentStatus" NOT NULL DEFAULT 'OPEN',
    "reported_by_user_id" UUID,
    "reported_by_admin_id" UUID,
    "owner_full_name" TEXT,
    "owner_national_code" TEXT,
    "incident_at" TIMESTAMP(3),
    "incident_location" TEXT,
    "description" TEXT NOT NULL,
    "police_report_number" TEXT,
    "contact_phone" TEXT,
    "reviewed_by_admin_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "admin_note" TEXT,
    "closed_at" TIMESTAMP(3),
    "close_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hologram_incident_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hologram_incident_reports_report_number_key" ON "hologram_incident_reports"("report_number");

-- CreateIndex
CREATE INDEX "hologram_incident_reports_hologram_code_id_idx" ON "hologram_incident_reports"("hologram_code_id");

-- CreateIndex
CREATE INDEX "hologram_incident_reports_status_created_at_idx" ON "hologram_incident_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "hologram_incident_reports_reported_by_user_id_idx" ON "hologram_incident_reports"("reported_by_user_id");

-- CreateIndex
CREATE INDEX "hologram_inquiry_logs_incident_report_id_created_at_idx" ON "hologram_inquiry_logs"("incident_report_id", "created_at");

-- AddForeignKey
ALTER TABLE "hologram_inquiry_logs" ADD CONSTRAINT "hologram_inquiry_logs_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hologram_inquiry_logs" ADD CONSTRAINT "hologram_inquiry_logs_incident_report_id_fkey" FOREIGN KEY ("incident_report_id") REFERENCES "hologram_incident_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hologram_incident_reports" ADD CONSTRAINT "hologram_incident_reports_hologram_code_id_fkey" FOREIGN KEY ("hologram_code_id") REFERENCES "hologram_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hologram_incident_reports" ADD CONSTRAINT "hologram_incident_reports_reported_by_user_id_fkey" FOREIGN KEY ("reported_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hologram_incident_reports" ADD CONSTRAINT "hologram_incident_reports_reported_by_admin_id_fkey" FOREIGN KEY ("reported_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hologram_incident_reports" ADD CONSTRAINT "hologram_incident_reports_reviewed_by_admin_id_fkey" FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- در هر لحظه حداکثر یک گزارش فعال (ثبت‌شده/تأییدشده) برای هر شمش — آخرین خط دفاع در برابر ثبت همزمان
CREATE UNIQUE INDEX "hologram_incident_reports_one_active_per_code"
  ON "hologram_incident_reports"("hologram_code_id")
  WHERE "status" IN ('OPEN', 'CONFIRMED');
