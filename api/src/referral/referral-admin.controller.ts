// api/src/referral/referral-admin.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { AuditLog } from '../admin-auth/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../admin-auth/interceptors/audit-log.interceptor';
import {
  REFERRAL_TRIGGERS,
  ReferralService,
  type ReferralRewardTrigger,
} from './referral.service';

class AdminListReferralsQueryDto {
  @IsOptional() page?: number;
  @IsOptional() limit?: number;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() referrerId?: string;
  @IsOptional() @IsIn(['REWARDED', 'PENDING']) status?: 'REWARDED' | 'PENDING';
}

class UpdateReferralSettingsDto {
  @IsOptional() @IsBoolean() enabled?: boolean;

  @IsOptional()
  @IsIn(REFERRAL_TRIGGERS)
  trigger?: ReferralRewardTrigger;

  /** پاداش ریالی هر دعوت (ریال) */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  @Max(100_000_000_000)
  rewardRial?: number;

  /** پاداش طلایی هر دعوت (میلی‌گرم، حداکثر یک رقم اعشار) */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(1_000_000)
  rewardMg?: number;
}

@ApiTags('Admin - Referrals')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@Controller('admin/referrals')
export class ReferralAdminController {
  constructor(private readonly referralService: ReferralService) {}

  @RequirePermission('referral.view')
  @Get()
  @ApiOperation({ summary: 'لیست دعوت‌ها (معرف، دعوت‌شده و پاداش)' })
  list(@Query() query: AdminListReferralsQueryDto) {
    return this.referralService.adminList({
      page: query.page ? Number(query.page) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
      search: query.search,
      referrerId: query.referrerId,
      status: query.status,
    });
  }

  @RequirePermission('referral.view')
  @Get('stats')
  @ApiOperation({ summary: 'آمار کلی دعوت‌ها و برترین معرف‌ها' })
  stats() {
    return this.referralService.adminStats();
  }

  @RequirePermission('referral.view')
  @Get('settings')
  @ApiOperation({ summary: 'تنظیمات پاداش دعوت از دوستان' })
  getSettings() {
    return this.referralService.getSettings();
  }

  @RequirePermission('referral.manage')
  @AuditLog('referral.update_settings')
  @UseInterceptors(AuditLogInterceptor)
  @Put('settings')
  @ApiOperation({ summary: 'ویرایش تنظیمات پاداش دعوت از دوستان' })
  updateSettings(@Body() dto: UpdateReferralSettingsDto) {
    return this.referralService.updateSettings(dto);
  }

  @RequirePermission('referral.manage')
  @AuditLog('referral.grant_reward')
  @UseInterceptors(AuditLogInterceptor)
  @Post(':id/grant')
  @ApiOperation({ summary: 'پرداخت دستی پاداش یک دعوت با تنظیمات فعلی' })
  grant(@Param('id', ParseUUIDPipe) id: string) {
    return this.referralService.grantManually(id);
  }
}
