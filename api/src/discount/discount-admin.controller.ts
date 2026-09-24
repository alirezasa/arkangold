// api/src/discount/discount-admin.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { AuditLog } from '../admin-auth/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../admin-auth/interceptors/audit-log.interceptor';
import { AdminAuthenticatedUser } from '../admin-auth/interfaces/admin-jwt-payload.interface';
import { DiscountService } from './discount.service';
import {
  AdminDiscountUsagesQueryDto,
  AdminListDiscountCodesQueryDto,
  CreateDiscountCodeDto,
  GenerateDiscountCodeQueryDto,
  UpdateDiscountCodeDto,
} from './discount.dto';

interface AdminRequest extends Request {
  user: AdminAuthenticatedUser;
}

@ApiTags('Admin - Discount Codes')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@Controller('admin/discount-codes')
export class DiscountAdminController {
  constructor(private readonly service: DiscountService) {}

  @RequirePermission('discount.view')
  @Get()
  @ApiOperation({ summary: 'لیست کدهای تخفیف با آمار استفاده' })
  list(@Query() query: AdminListDiscountCodesQueryDto) {
    return this.service.adminList(query);
  }

  @RequirePermission('discount.view')
  @Get('stats')
  @ApiOperation({ summary: 'آمار کلی تخفیف‌های اعطاشده' })
  stats() {
    return this.service.adminStats();
  }

  @RequirePermission('discount.manage')
  @Get('generate')
  @ApiOperation({ summary: 'تولید یک کد یکتا با فرمت حروف بزرگ-عدد' })
  async generate(@Query() query: GenerateDiscountCodeQueryDto) {
    return { code: await this.service.generateUniqueCode(query.prefix) };
  }

  @RequirePermission('discount.view')
  @Get(':id/usages')
  @ApiOperation({ summary: 'سفارش‌هایی که از این کد استفاده کرده‌اند' })
  usages(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: AdminDiscountUsagesQueryDto,
  ) {
    return this.service.adminUsages(id, query);
  }

  @RequirePermission('discount.manage')
  @AuditLog('discount_code.create')
  @UseInterceptors(AuditLogInterceptor)
  @Post()
  @ApiOperation({ summary: 'ایجاد کد تخفیف (دستی یا تولید خودکار)' })
  create(@Req() req: AdminRequest, @Body() dto: CreateDiscountCodeDto) {
    return this.service.create(req.user.adminUserId, dto);
  }

  @RequirePermission('discount.manage')
  @AuditLog('discount_code.update')
  @UseInterceptors(AuditLogInterceptor)
  @Patch(':id')
  @ApiOperation({ summary: 'ویرایش / فعال و غیرفعال‌سازی کد تخفیف' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDiscountCodeDto,
  ) {
    return this.service.update(id, dto);
  }

  @RequirePermission('discount.manage')
  @AuditLog('discount_code.delete')
  @UseInterceptors(AuditLogInterceptor)
  @Delete(':id')
  @ApiOperation({ summary: 'حذف کد تخفیف استفاده‌نشده' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
