-- CreateEnum
CREATE TYPE "SmsSendMode" AS ENUM ('TEXT', 'PATTERN');

-- CreateEnum
CREATE TYPE "SmsLogStatus" AS ENUM ('SENT', 'FAILED', 'DRY_RUN', 'SKIPPED');

-- CreateTable
CREATE TABLE "sms_templates" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "provider_code" TEXT,
    "send_mode" "SmsSendMode" NOT NULL DEFAULT 'TEXT',
    "smsir_template_id" TEXT,
    "ghasedak_template_name" TEXT,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sms_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_logs" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "user_id" UUID,
    "template_key" TEXT,
    "provider_code" TEXT,
    "send_mode" "SmsSendMode" NOT NULL DEFAULT 'TEXT',
    "text" TEXT NOT NULL,
    "status" "SmsLogStatus" NOT NULL,
    "provider_message_id" TEXT,
    "cost" DECIMAL(18,2),
    "error_message" TEXT,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sms_templates_key_key" ON "sms_templates"("key");

-- CreateIndex
CREATE INDEX "sms_templates_category_idx" ON "sms_templates"("category");

-- CreateIndex
CREATE INDEX "sms_logs_created_at_idx" ON "sms_logs"("created_at");

-- CreateIndex
CREATE INDEX "sms_logs_phone_created_at_idx" ON "sms_logs"("phone", "created_at");

-- CreateIndex
CREATE INDEX "sms_logs_template_key_created_at_idx" ON "sms_logs"("template_key", "created_at");

-- CreateIndex
CREATE INDEX "sms_logs_status_created_at_idx" ON "sms_logs"("status", "created_at");

-- CreateIndex
CREATE INDEX "sms_logs_reference_type_reference_id_idx" ON "sms_logs"("reference_type", "reference_id");

