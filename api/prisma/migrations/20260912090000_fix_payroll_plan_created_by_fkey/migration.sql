-- payroll_plans.created_by_id is populated with AdminUser.id (from the admin
-- JWT payload, see AdminJwtStrategy.validate -> adminUserId /
-- PayrollAdminController.createPlan -> req.user.adminUserId), never with a
-- User.id. Pointing its foreign key at "users" made every admin payroll
-- plan creation fail with a foreign key violation (surfaced to the admin
-- panel as a generic 500 error). Same class of bug fixed for withdrawals /
-- approvals / physical delivery requests in 20260912070000.

ALTER TABLE "payroll_plans" DROP CONSTRAINT "payroll_plans_created_by_id_fkey";

ALTER TABLE "payroll_plans" ADD CONSTRAINT "payroll_plans_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
