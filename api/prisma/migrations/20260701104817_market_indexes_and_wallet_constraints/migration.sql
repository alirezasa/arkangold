/*
  Warnings:

  - A unique constraint covering the columns `[metal]` on the table `market_prices` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "market_prices_metal_key" ON "market_prices"("metal");

-- CreateIndex
CREATE INDEX "price_locks_user_id_used_idx" ON "price_locks"("user_id", "used");

-- CreateIndex
CREATE INDEX "transactions_user_id_type_status_created_at_idx" ON "transactions"("user_id", "type", "status", "created_at");
