-- These columns are populated with AdminUser.id (from the admin JWT payload,
-- see AdminJwtStrategy.validate -> adminUserId), never with a User.id.
-- Pointing their foreign keys at "users" made every admin approve/reject/
-- cancel action on withdrawals, approvals and physical delivery requests
-- fail with a foreign key violation (surfaced to the admin panel as a
-- generic 400 error).

ALTER TABLE "withdrawal_requests" DROP CONSTRAINT "withdrawal_requests_processed_by_id_fkey";
ALTER TABLE "approvals" DROP CONSTRAINT "approvals_approver_id_fkey";
ALTER TABLE "physical_delivery_requests" DROP CONSTRAINT "physical_delivery_requests_approved_by_id_fkey";

ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_processed_by_id_fkey" FOREIGN KEY ("processed_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "physical_delivery_requests" ADD CONSTRAINT "physical_delivery_requests_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
