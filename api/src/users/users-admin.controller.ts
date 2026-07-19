// api/src/users/users-admin.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Request } from 'express';
import { IsOptional, IsString } from 'class-validator';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { AuditLog } from '../admin-auth/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../admin-auth/interceptors/audit-log.interceptor';
import { AdminAuthenticatedUser } from '../admin-auth/interfaces/admin-jwt-payload.interface';

class RejectLegalProfileDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

class ListPendingLegalQueryDto {
  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}

interface AdminRequest extends Request {
  user: AdminAuthenticatedUser;
}

@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@Controller('admin/legal-profiles')
export class UsersAdminController {
  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
  ) {}

  // ── لیست پروفایل‌های حقوقیِ ثبت‌شده و منتظر تایید ──
  @RequirePermission('legal_profile.view')
  @Get('pending')
  async listPending(@Query() query: ListPendingLegalQueryDto) {
    const page = query.page ? Number(query.page) : 1;
    const limit = Math.min(query.limit ? Number(query.limit) : 20, 100);

    const where = {
      verified: false,
      companyName: { not: '' }, // یعنی واقعاً ثبت شده، نه رکورد خالی اولیه
    };

    const [items, total] = await Promise.all([
      this.prisma.legalProfile.findMany({
        where,
        include: {
          user: { select: { id: true, phone: true, status: true } },
          representative: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.legalProfile.count({ where }),
    ]);

    return {
      data: items.map((lp) => ({
        userId: lp.userId,
        companyName: lp.companyName,
        nationalId: lp.nationalId,
        economicCode: lp.economicCode,
        registrationNumber: lp.registrationNumber,
        representative: lp.representative
          ? {
              firstName: lp.representative.firstName,
              lastName: lp.representative.lastName,
              nationalCode: lp.representative.nationalCode,
              status: lp.representative.status,
            }
          : null,
        user: lp.user,
        createdAt: lp.createdAt.toISOString(),
      })),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  @RequirePermission('legal_profile.approve')
  @AuditLog('legal_profile.approve')
  @UseInterceptors(AuditLogInterceptor)
  @Post(':userId/approve')
  approve(@Param('userId') userId: string) {
    return this.usersService.approveLegalProfile(userId);
  }

  @RequirePermission('legal_profile.approve')
  @AuditLog('legal_profile.reject')
  @UseInterceptors(AuditLogInterceptor)
  @Post(':userId/reject')
  reject(@Param('userId') userId: string, @Body() dto: RejectLegalProfileDto) {
    return this.usersService.rejectLegalProfile(userId, dto.reason);
  }
}
