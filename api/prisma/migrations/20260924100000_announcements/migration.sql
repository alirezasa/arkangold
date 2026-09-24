-- اعلان‌های درون‌برنامه‌ای که ادمین درج می‌کند (زنگوله اعلان‌های اپلیکیشن کاربر)
CREATE TYPE "AnnouncementLevel" AS ENUM ('INFO', 'SUCCESS', 'WARNING', 'PROMO');
CREATE TYPE "AnnouncementAudience" AS ENUM ('ALL', 'SELECTED');

CREATE TABLE "announcements" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "level" "AnnouncementLevel" NOT NULL DEFAULT 'INFO',
    "audience" "AnnouncementAudience" NOT NULL DEFAULT 'ALL',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "announcement_recipients" (
    "announcement_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "announcement_recipients_pkey" PRIMARY KEY ("announcement_id","user_id")
);

CREATE TABLE "announcement_reads" (
    "announcement_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_reads_pkey" PRIMARY KEY ("announcement_id","user_id")
);

CREATE INDEX "announcements_is_active_published_at_idx" ON "announcements"("is_active", "published_at");
CREATE INDEX "announcement_recipients_user_id_idx" ON "announcement_recipients"("user_id");
CREATE INDEX "announcement_reads_user_id_idx" ON "announcement_reads"("user_id");

ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "announcement_recipients" ADD CONSTRAINT "announcement_recipients_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_recipients" ADD CONSTRAINT "announcement_recipients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
