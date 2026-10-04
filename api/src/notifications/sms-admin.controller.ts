// api/src/notifications/sms-admin.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { AuditLog } from '../admin-auth/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../admin-auth/interceptors/audit-log.interceptor';
import { AdminAuthenticatedUser } from '../admin-auth/interfaces/admin-jwt-payload.interface';
import { SmsAdminService } from './sms-admin.service';

interface AdminRequest {
  user: AdminAuthenticatedUser;
}

class UpdateSmsTemplateDto {
  @IsOptional() @IsString() @MaxLength(600) body?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() providerCode?: string | null;
  @IsOptional() @IsIn(['TEXT', 'PATTERN']) sendMode?: 'TEXT' | 'PATTERN';
  @IsOptional() @IsString() @MaxLength(20) smsirTemplateId?: string | null;
  @IsOptional() @IsString() @MaxLength(100) ghasedakTemplateName?:
    string | null;
}

class TestSmsDto {
  @IsString() @Matches(/^[0-9۰-۹+\s-]{10,16}$/) phone!: string;
  @IsOptional() @IsString() @MaxLength(300) text?: string;
}

class UpdateSmsProviderDto {
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(99) priority?: number;
  @IsOptional() @IsBoolean() isFallback?: boolean;
}

class SetSmsCredentialDto {
  @IsString() @MaxLength(40) key!: string;
  @IsString() @MaxLength(500) value!: string;
}

@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@Controller('admin/sms')
export class SmsAdminController {
  constructor(private readonly service: SmsAdminService) {}

  @Get('templates')
  @RequirePermission('sms.view')
  listTemplates() {
    return this.service.listTemplates();
  }

  @Patch('templates/:key')
  @RequirePermission('sms.manage')
  @AuditLog('sms.template_update')
  @UseInterceptors(AuditLogInterceptor)
  updateTemplate(
    @Req() req: AdminRequest,
    @Param('key') key: string,
    @Body() dto: UpdateSmsTemplateDto,
  ) {
    return this.service.updateTemplate(key, dto, req.user.adminUserId);
  }

  @Post('templates/:key/reset')
  @RequirePermission('sms.manage')
  @AuditLog('sms.template_reset')
  @UseInterceptors(AuditLogInterceptor)
  resetTemplate(@Req() req: AdminRequest, @Param('key') key: string) {
    return this.service.resetTemplate(key, req.user.adminUserId);
  }

  @Post('templates/:key/test')
  @RequirePermission('sms.manage')
  @AuditLog('sms.template_test')
  @UseInterceptors(AuditLogInterceptor)
  testTemplate(@Param('key') key: string, @Body() dto: TestSmsDto) {
    return this.service.testTemplate(key, dto.phone);
  }

  @Get('providers')
  @RequirePermission('sms.view')
  listProviders() {
    return this.service.listProviders();
  }

  @Patch('providers/:code')
  @RequirePermission('sms.manage')
  @AuditLog('sms.provider_update')
  @UseInterceptors(AuditLogInterceptor)
  updateProvider(
    @Param('code') code: string,
    @Body() dto: UpdateSmsProviderDto,
  ) {
    return this.service.updateProvider(code, dto);
  }

  @Get('providers/:code/credentials')
  @RequirePermission('integrations.credentials.manage')
  listCredentials(@Param('code') code: string) {
    return this.service.listCredentials(code);
  }

  @Post('providers/:code/credentials')
  @RequirePermission('integrations.credentials.manage')
  @AuditLog('sms.provider_credential_set')
  @UseInterceptors(AuditLogInterceptor)
  setCredential(@Param('code') code: string, @Body() dto: SetSmsCredentialDto) {
    return this.service.setCredential(code, dto.key, dto.value);
  }

  @Get('providers/:code/account')
  @RequirePermission('sms.view')
  accountInfo(@Param('code') code: string) {
    return this.service.accountInfo(code);
  }

  @Post('providers/:code/test')
  @RequirePermission('sms.manage')
  @AuditLog('sms.provider_test')
  @UseInterceptors(AuditLogInterceptor)
  testProvider(@Param('code') code: string, @Body() dto: TestSmsDto) {
    return this.service.testProvider(code, dto.phone, dto.text ?? '');
  }

  @Get('logs')
  @RequirePermission('sms.view')
  listLogs(
    @Query('status') status?: string,
    @Query('providerCode') providerCode?: string,
    @Query('templateKey') templateKey?: string,
    @Query('phone') phone?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listLogs({
      status,
      providerCode,
      templateKey,
      phone,
      from,
      to,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
