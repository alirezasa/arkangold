/*
  Warnings:

  - Added the required column `updated_at` to the `legal_profiles` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "LegalProfileStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- AlterTable
ALTER TABLE "legal_profiles" ADD COLUMN     "rejection_reason" TEXT,
ADD COLUMN     "status" "LegalProfileStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

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

-- CreateIndex
CREATE INDEX "legal_profile_documents_legal_profile_id_idx" ON "legal_profile_documents"("legal_profile_id");

-- AddForeignKey
ALTER TABLE "legal_profile_documents" ADD CONSTRAINT "legal_profile_documents_legal_profile_id_fkey" FOREIGN KEY ("legal_profile_id") REFERENCES "legal_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
