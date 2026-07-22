import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { IsOptional, IsString, IsBoolean } from 'class-validator';
import { UsersService } from './users.service';
import { LegalDocumentsService } from './legal-documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { LegalProfileStatus, Prisma } from '../generated/prisma/client';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';

class RejectLegalProfileDto {
  @IsString()
  reason!: string;

  @IsBoolean()
  editable!: boolean; // true = قابل ویرایش | false = رد کامل (حذف اطلاعات)
}

class ListPendingLegalQueryDto {
  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}

const legalProfileInclude = {
  user: { select: { id: true, phone: true, status: true } },
  representative: true,
  documents: true,
} satisfies Prisma.LegalProfileInclude;

@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@Controller('admin/legal-profiles')
export class UsersAdminController {
  constructor(
    private readonly usersService: UsersService,
    private readonly legalDocumentsService: LegalDocumentsService,
    private readonly prisma: PrismaService,
  ) {}

  @RequirePermission('legal_profile.view')
  @Get('pending')
  async listPending(@Query() query: ListPendingLegalQueryDto) {
    const page = query.page ? Number(query.page) : 1;
    const limit = Math.min(query.limit ? Number(query.limit) : 20, 100);

    // نمایش هم موارد در انتظار (PENDING) و هم موارد رد شده‌ی قابل ویرایش (REJECTED)
    const where: Prisma.LegalProfileWhereInput = {
      verified: false,
      companyName: { not: '' },
      status: {
        in: [LegalProfileStatus.PENDING, LegalProfileStatus.REJECTED],
      },
    };

    const [items, total] = await Promise.all([
      this.prisma.legalProfile.findMany({
        where,
        include: legalProfileInclude,
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
        status: lp.status,
        rejectionReason: lp.rejectionReason,
        documents: lp.documents.map((d) => ({
          id: d.id,
          type: d.type,
          fileName: d.fileName,
          fileSize: d.fileSize,
          uploadedAt: d.uploadedAt,
        })),
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
  @Post(':userId/approve')
  approve(@Param('userId') userId: string) {
    return this.usersService.approveLegalProfile(userId);
  }

  @RequirePermission('legal_profile.approve')
  @Post(':userId/reject')
  reject(@Param('userId') userId: string, @Body() dto: RejectLegalProfileDto) {
    return this.usersService.rejectLegalProfile(
      userId,
      dto.reason,
      dto.editable,
    );
  }

  @RequirePermission('legal_profile.view')
  @Get(':userId/documents')
  listDocuments(@Param('userId') userId: string) {
    return this.legalDocumentsService.listForAdmin(userId);
  }

  @RequirePermission('legal_profile.view')
  @Get('documents/:documentId/download')
  async downloadDocument(
    @Param('documentId') documentId: string,
    @Res() res: Response,
  ) {
    const doc = await this.legalDocumentsService.getForAdmin(documentId);
    return res.download(doc.filePath, doc.fileName);
  }
}
