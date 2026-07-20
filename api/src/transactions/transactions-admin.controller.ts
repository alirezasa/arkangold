import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { TransactionsAdminService } from './transactions-admin.service';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';

// توجه: در صورتی که TransactionType و TransactionStatus در پروژه شما (مثلا در فایل prisma client یا فایل انواع تراکنش‌ها) تعریف شده‌اند،
// آن‌ها را به جای تعاریف محلی زیر Import کنید.
// import { TransactionType, TransactionStatus } from '@prisma/client';

class AdminListTransactionsQueryDto {
  @IsOptional() page?: number;
  @IsOptional() limit?: number;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() status?: string;
}

@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@RequirePermission('transactions.view')
@Controller('admin/transactions')
export class TransactionsAdminController {
  constructor(private readonly service: TransactionsAdminService) {}

  @Get()
  list(@Query() query: AdminListTransactionsQueryDto) {
    return this.service.list({
      page: query.page ? Number(query.page) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
      userId: query.userId,
      // رفع خطا: کست کردن ایمن با واسطه unknown به جای any مستقیم برای هماهنگی با تایپ‌های تعریف شده در متد سرویس
      type: query.type ? (query.type as unknown as never) : undefined,
      status: query.status ? (query.status as unknown as never) : undefined,
    });
  }
}
