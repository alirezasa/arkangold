-- FIA (شناسایی و احراز هویت): TOTP و کدهای بازیابی کاربران، رمز موقت ادمین‌ها،
-- دستگاه‌های شناخته‌شده‌ی ورود و انقضای کلید API شرکای فروش

-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "password_changed_at" TIMESTAMP(3),
ADD COLUMN     "password_expires_at" TIMESTAMP(3),
ADD COLUMN     "totp_last_step" INTEGER;

-- AlterTable
ALTER TABLE "sales_partners" ADD COLUMN     "api_key_created_at" TIMESTAMP(3),
ADD COLUMN     "api_key_expires_at" TIMESTAMP(3),
ADD COLUMN     "api_key_reminder_days" INTEGER;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "backup_codes_hash" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "password_changed_at" TIMESTAMP(3),
ADD COLUMN     "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totp_enabled_at" TIMESTAMP(3),
ADD COLUMN     "totp_last_step" INTEGER,
ADD COLUMN     "totp_secret" TEXT;

-- CreateTable
CREATE TABLE "login_devices" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "admin_user_id" UUID,
    "fingerprint" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "last_ip" TEXT,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "login_devices_user_id_fingerprint_key" ON "login_devices"("user_id", "fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "login_devices_admin_user_id_fingerprint_key" ON "login_devices"("admin_user_id", "fingerprint");

-- AddForeignKey
ALTER TABLE "login_devices" ADD CONSTRAINT "login_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_devices" ADD CONSTRAINT "login_devices_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- FIA_UID_EXT.1.5: کلیدهای API موجود از امروز یک سال اعتبار می‌گیرند
UPDATE "sales_partners" SET "api_key_created_at" = COALESCE("updated_at", CURRENT_TIMESTAMP), "api_key_expires_at" = CURRENT_TIMESTAMP + INTERVAL '365 days' WHERE "api_key_hash" IS NOT NULL;
