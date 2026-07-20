// api/src/admin-auth/admin-audit-log.controller.ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AdminJwtAuthGuard } from './guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from './guards/admin-permission.guard';
import { RequirePermission } from './decorators/require-permission.decorator';

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
  constructor(private prisma: PrismaService) {}

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
        ip: l.ip,
        createdAt: l.createdAt.toISOString(),
      })),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }
}
