-- CreateTable
CREATE TABLE "admin_user_roles" (
    "admin_user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_user_roles_pkey" PRIMARY KEY ("admin_user_id","role_id")
);

-- CreateIndex
CREATE INDEX "admin_user_roles_role_id_idx" ON "admin_user_roles"("role_id");

-- AddForeignKey
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "admin_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- انتقال نقش فعلی هر ادمین به جدول چندنقشی
INSERT INTO "admin_user_roles" ("admin_user_id", "role_id", "assigned_at")
SELECT "id", "role_id", "created_at" FROM "admin_users";

-- DropForeignKey
ALTER TABLE "admin_users" DROP CONSTRAINT "admin_users_role_id_fkey";

-- AlterTable
ALTER TABLE "admin_users" DROP COLUMN "role_id";
