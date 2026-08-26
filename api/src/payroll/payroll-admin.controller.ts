import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PayrollService } from './payroll.service';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { AuditLog } from '../admin-auth/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../admin-auth/interceptors/audit-log.interceptor';
import { AdminAuthenticatedUser } from '../admin-auth/interfaces/admin-jwt-payload.interface';
import {
  CreatePayrollPlanDto,
  UpdatePayrollPlanDto,
  AddPayrollPlanUsersDto,
} from '@arkan-gold/shared';

interface AdminRequest extends Request {
  user: AdminAuthenticatedUser;
}

@ApiTags('Admin - Payroll')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@Controller('admin/payroll')
export class PayrollAdminController {
  constructor(private readonly payrollService: PayrollService) {}

  @RequirePermission('payroll.view')
  @Get('plans')
  @ApiOperation({ summary: 'لیست پلن‌های پی‌رول' })
  listPlans() {
    return this.payrollService.listPlans();
  }

  @RequirePermission('payroll.view')
  @Get('plans/:id')
  @ApiOperation({ summary: 'جزئیات یک پلن پی‌رول' })
  getPlan(@Param('id') id: string) {
    return this.payrollService.getPlan(id);
  }

  @RequirePermission('payroll.manage')
  @AuditLog('payroll.create_plan')
  @UseInterceptors(AuditLogInterceptor)
  @Post('plans')
  @ApiOperation({ summary: 'ایجاد پلن پی‌رول جدید' })
  createPlan(@Req() req: AdminRequest, @Body() dto: CreatePayrollPlanDto) {
    return this.payrollService.createPlan(req.user.adminUserId, dto);
  }

  @RequirePermission('payroll.manage')
  @AuditLog('payroll.update_plan')
  @UseInterceptors(AuditLogInterceptor)
  @Patch('plans/:id')
  @ApiOperation({ summary: 'ویرایش پلن پی‌رول' })
  updatePlan(@Param('id') id: string, @Body() dto: UpdatePayrollPlanDto) {
    return this.payrollService.updatePlan(id, dto);
  }

  @RequirePermission('payroll.manage')
  @AuditLog('payroll.add_users')
  @UseInterceptors(AuditLogInterceptor)
  @Post('plans/:id/users')
  @ApiOperation({ summary: 'افزودن کاربران به پلن' })
  addUsers(@Param('id') id: string, @Body() dto: AddPayrollPlanUsersDto) {
    return this.payrollService.addUsers(id, dto.userIds);
  }

  @RequirePermission('payroll.manage')
  @AuditLog('payroll.remove_user')
  @UseInterceptors(AuditLogInterceptor)
  @Delete('plans/:id/users/:userId')
  @ApiOperation({ summary: 'حذف کاربر از پلن' })
  removeUser(@Param('id') id: string, @Param('userId') userId: string) {
    return this.payrollService.removeUser(id, userId);
  }

  @RequirePermission('payroll.manage')
  @AuditLog('payroll.execute')
  @UseInterceptors(AuditLogInterceptor)
  @Post('plans/:id/execute')
  @ApiOperation({ summary: 'اجرای دستی پرداخت پی‌رول برای پلن (توسط ادمین)' })
  executePlan(@Param('id') id: string) {
    return this.payrollService.executePlan(id);
  }
}
