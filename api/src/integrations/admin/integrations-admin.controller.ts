import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AdminJwtAuthGuard } from '../../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../../admin-auth/decorators/require-permission.decorator';
import { AuditLog } from '../../admin-auth/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../../admin-auth/interceptors/audit-log.interceptor';
import { IntegrationsAdminService } from './integrations-admin.service';
import {
  UpdateProviderDto,
  UpdateProviderServiceDto,
  UpdateServiceDto,
  UpsertCredentialDto,
} from './dto/integrations-admin.dto';

@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@Controller('admin/integrations')
export class IntegrationsAdminController {
  constructor(private readonly service: IntegrationsAdminService) {}

  @Get('services')
  @RequirePermission('integrations.view')
  listServices() {
    return this.service.listServices();
  }

  @Get('providers')
  @RequirePermission('integrations.view')
  listProviders() {
    return this.service.listProviders();
  }

  @Patch('services/:code')
  @RequirePermission('integrations.manage')
  @AuditLog('integrations.service.update')
  @UseInterceptors(AuditLogInterceptor)
  updateService(@Param('code') code: string, @Body() dto: UpdateServiceDto) {
    return this.service.updateService(code, dto.isActive ?? true);
  }

  @Patch('providers/:code')
  @RequirePermission('integrations.manage')
  @AuditLog('integrations.provider.update')
  @UseInterceptors(AuditLogInterceptor)
  updateProvider(@Param('code') code: string, @Body() dto: UpdateProviderDto) {
    return this.service.updateProvider(code, dto.isActive ?? true);
  }

  @Patch('providers/:providerCode/services/:serviceCode')
  @RequirePermission('integrations.manage')
  @AuditLog('integrations.provider_service.update')
  @UseInterceptors(AuditLogInterceptor)
  updateProviderService(
    @Param('providerCode') providerCode: string,
    @Param('serviceCode') serviceCode: string,
    @Body() dto: UpdateProviderServiceDto,
  ) {
    return this.service.updateProviderService(providerCode, serviceCode, dto);
  }

  @Get('providers/:code/credentials')
  @RequirePermission('integrations.credentials.manage')
  listCredentials(@Param('code') code: string) {
    return this.service.listCredentials(code);
  }

  @Post('providers/:code/credentials')
  @RequirePermission('integrations.credentials.manage')
  @AuditLog('integrations.credential.set')
  @UseInterceptors(AuditLogInterceptor)
  setCredential(@Param('code') code: string, @Body() dto: UpsertCredentialDto) {
    return this.service.setCredential(code, dto.key, dto.value);
  }

  @Get('logs')
  @RequirePermission('integrations.view')
  listLogs(
    @Query('providerCode') providerCode?: string,
    @Query('serviceCode') serviceCode?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listLogs({
      providerCode,
      serviceCode,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('providers/finotech/test-connection')
  @RequirePermission('integrations.manage')
  @AuditLog('integrations.finotech.test_connection')
  @UseInterceptors(AuditLogInterceptor)
  testFinotechConnection() {
    return this.service.testFinotechConnection();
  }
}
