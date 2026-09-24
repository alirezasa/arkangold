-- AlterTable
ALTER TABLE "referrals" ADD COLUMN "rewarded_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "referral_rewards_referral_id_idx" ON "referral_rewards"("referral_id");

-- CreateIndex
CREATE INDEX "referral_rewards_user_id_idx" ON "referral_rewards"("user_id");
