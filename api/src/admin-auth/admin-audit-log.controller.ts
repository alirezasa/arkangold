// api/src/admin-auth/admin-audit-log.controller.ts
import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AdminJwtAuthGuard } from './guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from './guards/admin-permission.guard';
import { RequirePermission } from './decorators/require-permission.decorator';
import { AuditService, ChainVerificationResult } from '../common/audit/audit.service';

class ListAuditLogQueryDto {
  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;

  @IsOptional()
  @IsString()
  adminUserId?: string;

  @IsOptional()
  @IsString()
  action?: string;
}

@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@RequirePermission('admin.audit_log.view')
@Controller('admin/audit-log')
export class AdminAuditLogController {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  @Get()
  async list(@Query() query: ListAuditLogQueryDto) {
    const page = query.page ? Number(query.page) : 1;
    const limit = Math.min(query.limit ? Number(query.limit) : 30, 100);

    const where = {
      ...(query.adminUserId ? { adminUserId: query.adminUserId } : {}),
      ...(query.action ? { action: { contains: query.action } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.adminAuditLog.findMany({
        where,
        include: { adminUser: { select: { username: true, fullName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.adminAuditLog.count({ where }),
    ]);

    return {
      data: items.map((l) => ({
        id: l.id,
        action: l.action,
        entityType: l.entityType,
        entityId: l.entityId,
        admin: l.adminUser,
        actorLabel: l.actorLabel,
        ip: l.ip,
        userAgent: l.userAgent,
        source: l.source,
        success: l.success,
        createdAt: l.createdAt.toISOString(),
      })),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  @Get('users')
  async listUserEvents(@Query() query: ListAuditLogQueryDto) {
    const page = query.page ? Number(query.page) : 1;
    const limit = Math.min(query.limit ? Number(query.limit) : 30, 100);

    const where = {
      ...(query.action ? { action: { contains: query.action } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { phone: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: items.map((l) => ({
        id: l.id,
        action: l.action,
        entityType: l.entityType,
        entityId: l.entityId,
        userId: l.userId,
        userPhone: l.user?.phone ?? null,
        actorLabel: l.actorLabel,
        ip: l.ip,
        userAgent: l.userAgent,
        source: l.source,
        success: l.success,
        createdAt: l.createdAt.toISOString(),
      })),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /** FAU_STG_EXT.1.2: بازبینی یکپارچگی زنجیره‌ی hash — تشخیص دستکاری/حذف رویدادها */
  @Get('verify')
  async verify(
    @Query('chain') chain?: string,
  ): Promise<Record<'admin' | 'user', ChainVerificationResult>> {
    let chainIds: Array<'admin' | 'user'>;
    if (!chain) {
      chainIds = ['admin', 'user'];
    } else if (chain === 'admin' || chain === 'user') {
      chainIds = [chain];
    } else {
      throw new BadRequestException('chain باید admin یا user باشد');
    }

    const results = {} as Record<'admin' | 'user', ChainVerificationResult>;
    for (const id of chainIds) {
      results[id] = await this.auditService.verifyChain(id);
    }
    return results;
  }
}
