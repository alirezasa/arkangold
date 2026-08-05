/*
  Warnings:

  - A unique constraint covering the columns `[gateway_provider,gateway_provider_ref]` on the table `payments` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "PaymentGatewayProvider" AS ENUM ('ZARINPAL', 'BEHPARDAKHT');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "gateway_provider" "PaymentGatewayProvider",
ADD COLUMN     "gateway_provider_ref" TEXT,
ADD COLUMN     "gateway_tracking_code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "payments_gateway_provider_gateway_provider_ref_key" ON "payments"("gateway_provider", "gateway_provider_ref");
