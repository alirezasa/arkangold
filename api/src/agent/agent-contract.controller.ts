// api/src/agent/agent-contract.controller.ts
//
// قرارداد الکترونیک نمایندگان — مدیریت (پنل) و مطالعه/امضا (پرتال نماینده).
// در پرتال، شناسه‌ی نماینده همیشه از نشست خوانده می‌شود، نه از ورودی.
import {
  Body,
  Controller,
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
import { Throttle } from '@nestjs/throttler';
import {
  Equals,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Request } from 'express';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { AuditLog } from '../admin-auth/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../admin-auth/interceptors/audit-log.interceptor';
import { AdminAuthenticatedUser } from '../admin-auth/interfaces/admin-jwt-payload.interface';
import { AgentScopeGuard, AgentPortalRequest } from './agent-scope.guard';
import { AgentContractService, ContractActor } from './agent-contract.service';

interface AdminRequest extends Request {
  user: AdminAuthenticatedUser;
}

const actorOf = (req: AdminRequest | AgentPortalRequest): ContractActor => ({
  adminUserId: req.user.adminUserId,
  ip: req.ip,
  userAgent: req.headers?.['user-agent'],
});

class TemplateDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(60000) body?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class CreateContractDto {
  @IsUUID() agentId!: string;
  @IsOptional() @IsUUID() templateId?: string;
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(60000) body?: string;
  @IsOptional() @IsString() startsAt?: string;
  @IsOptional() @IsString() endsAt?: string;
  @IsOptional() @IsString() signDeadline?: string;
}

class UpdateContractDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(60000) body?: string;
  @IsOptional() @IsString() startsAt?: string | null;
  @IsOptional() @IsString() endsAt?: string | null;
  @IsOptional() @IsString() signDeadline?: string | null;
}

class CancelContractDto {
  @IsString() @MinLength(5) @MaxLength(500) reason!: string;
}

class ListContractsQuery {
  @IsOptional() @IsUUID() agentId?: string;
  @IsOptional()
  @IsIn(['DRAFT', 'ISSUED', 'SIGNED', 'CANCELLED', 'EXPIRED'])
  status?: string;
  @IsOptional() page?: string;
  @IsOptional() limit?: string;
}

class SignContractDto {
  @IsString()
  @Matches(/^[0-9۰-۹]{6}$/, { message: 'کد امضا ۶ رقمی است' })
  code!: string;
  @IsBoolean()
  @Equals(true, { message: 'برای امضا باید مفاد قرارداد را بپذیرید' })
  accept!: boolean;
  @IsOptional() @IsString() @MaxLength(100) signerName?: string;
}

@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@UseInterceptors(AuditLogInterceptor)
@Controller('admin/agent-contracts')
export class AgentContractAdminController {
  constructor(private readonly contracts: AgentContractService) {}

  @RequirePermission('agent.view')
  @Get('templates')
  listTemplates() {
    return this.contracts.listTemplates();
  }

  @RequirePermission('agent.contract.manage')
  @AuditLog('agent_contract.template_create')
  @Post('templates')
  createTemplate(@Req() req: AdminRequest, @Body() dto: TemplateDto) {
    return this.contracts.createTemplate(
      {
        title: dto.title ?? '',
        body: dto.body ?? '',
        description: dto.description ?? undefined,
      },
      req.user.adminUserId,
    );
  }

  @RequirePermission('agent.contract.manage')
  @AuditLog('agent_contract.template_update')
  @Patch('templates/:id')
  updateTemplate(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TemplateDto,
  ) {
    return this.contracts.updateTemplate(id, dto, req.user.adminUserId);
  }

  @RequirePermission('agent.view')
  @Get()
  list(@Query() q: ListContractsQuery) {
    return this.contracts.listContracts({
      agentId: q.agentId,
      status: q.status,
      page: q.page ? Number(q.page) : undefined,
      limit: q.limit ? Number(q.limit) : undefined,
    });
  }

  @RequirePermission('agent.contract.manage')
  @AuditLog('agent_contract.create')
  @Post()
  create(@Req() req: AdminRequest, @Body() dto: CreateContractDto) {
    return this.contracts.createDraft(dto.agentId, dto, actorOf(req));
  }

  @RequirePermission('agent.view')
  @Get(':id')
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.contracts.getContractAdmin(id);
  }

  @RequirePermission('agent.contract.manage')
  @AuditLog('agent_contract.update')
  @Patch(':id')
  update(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContractDto,
  ) {
    return this.contracts.updateDraft(id, dto, actorOf(req));
  }

  @RequirePermission('agent.contract.manage')
  @AuditLog('agent_contract.issue')
  @Post(':id/issue')
  issue(@Req() req: AdminRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.contracts.issue(id, actorOf(req));
  }

  @RequirePermission('agent.contract.manage')
  @AuditLog('agent_contract.cancel')
  @Post(':id/cancel')
  cancel(
    @Req() req: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelContractDto,
  ) {
    return this.contracts.cancel(id, dto.reason, actorOf(req));
  }
}

@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard, AgentScopeGuard)
@UseInterceptors(AuditLogInterceptor)
@Controller('agent-portal/contracts')
export class AgentContractPortalController {
  constructor(private readonly contracts: AgentContractService) {}

  @RequirePermission('agent_portal.view')
  @Get()
  list(@Req() req: AgentPortalRequest) {
    return this.contracts.listForAgent(req.user.agentId);
  }

  @RequirePermission('agent_portal.view')
  @Get(':id')
  getOne(
    @Req() req: AgentPortalRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.contracts.getForAgent(req.user.agentId, id, actorOf(req));
  }

  @RequirePermission('agent_portal.contract.sign')
  @AuditLog('agent_portal.contract_otp')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post(':id/request-otp')
  requestOtp(
    @Req() req: AgentPortalRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.contracts.requestSignOtp(req.user.agentId, id, actorOf(req));
  }

  @RequirePermission('agent_portal.contract.sign')
  @AuditLog('agent_portal.contract_sign')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':id/sign')
  sign(
    @Req() req: AgentPortalRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SignContractDto,
  ) {
    return this.contracts.sign(req.user.agentId, id, dto, actorOf(req));
  }
}
