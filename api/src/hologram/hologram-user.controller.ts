// api/src/hologram/hologram-user.controller.ts
//
// بخش پنل کاربری (app.arkan.gold): استعلام از داخل پنل (نمایش کامل کد ملی چون
// کاربر لاگین‌کرده و رفتارش قابل ردیابی است)، لیست شمش‌های خودم، و منوی
// «تأیید و انتقال مالکیت» (بند ۳.۴ / ۳.۵ / ۶.۲ / ۶.۳).
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { HologramService } from './hologram.service';
import { HologramTransferService } from './hologram-transfer.service';
import { HologramSecurityService } from './hologram-security.service';
import { HologramIncidentService } from './hologram-incident.service';
import { extractClientIp } from './hologram-ip.util';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { PrismaService } from '../prisma/prisma.service';
import {
  CancelHologramIncidentDto,
  ConfirmHologramTransferDto,
  CreateHologramIncidentDto,
  HologramInquiryChannel,
  InitiateHologramTransferDto,
  RejectHologramTransferDto,
  VerifyHologramCodeDto,
} from '@arkan-gold/shared';
import { OwnedResource } from '../common/audit/owned-resource.decorator';

interface AuthenticatedRequest extends Request {
  user: { userId: string; phone: string; sessionId: string };
}

@ApiTags('Hologram - User Panel')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveUserGuard)
@Controller('user/hologram')
export class HologramUserController {
  constructor(
    private readonly hologramService: HologramService,
    private readonly transferService: HologramTransferService,
    private readonly security: HologramSecurityService,
    private readonly incidents: HologramIncidentService,
    private readonly prisma: PrismaService,
  ) {}

  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @Post('verify')
  @ApiOperation({
    summary:
      'استعلام اصالت از داخل پنل کاربری (کد ملی مالک فقط برای خود مالک کامل نمایش داده می‌شود)',
  })
  async verify(
    @Req() req: AuthenticatedRequest,
    @Body() dto: VerifyHologramCodeDto,
  ) {
    const ipAddress = extractClientIp(req);
    await this.security.assertAllowed(ipAddress);

    return this.hologramService.verify(dto.code, {
      ipAddress,
      userAgent: req.headers['user-agent'],
      channel: HologramInquiryChannel.APP_PANEL,
      userId: req.user.userId,
      maskNationalCodeInResponse: false,
    });
  }

  @Get('my-holograms')
  @ApiOperation({ summary: 'لیست شمش‌های طلای متعلق به کاربر جاری' })
  async myHolograms(@Req() req: AuthenticatedRequest) {
    const ownerships = await this.prisma.hologramOwnership.findMany({
      where: { ownerUserId: req.user.userId, status: 'ACTIVE' },
      orderBy: { ownershipStartAt: 'desc' },
      include: {
        hologramCode: {
          include: { batch: { select: { batchNumber: true } } },
        },
      },
    });
    const active = await this.incidents.activeByCodeIds(
      ownerships.map((o) => o.hologramCodeId),
    );
    return {
      data: ownerships.map((o) => ({
        ...o,
        activeIncident: active.get(o.hologramCodeId) ?? null,
      })),
    };
  }

  // ── اعلام سرقت / مفقودی ──
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('incidents')
  @ApiOperation({
    summary:
      'اعلام سرقت یا مفقودی شمش توسط مالک — از همین لحظه در همه‌ی استعلام‌ها هشدار نمایش داده می‌شود',
  })
  reportIncident(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateHologramIncidentDto,
  ) {
    return this.incidents.createByOwner(req.user.userId, dto);
  }

  @Get('incidents')
  @ApiOperation({ summary: 'گزارش‌های سرقت/مفقودی ثبت‌شده توسط من' })
  myIncidents(@Req() req: AuthenticatedRequest) {
    return this.incidents.listMine(req.user.userId);
  }

  @OwnedResource({
    model: 'hologramIncidentReport',
    ownerPath: 'reportedByUserId',
  })
  @Post('incidents/:id/cancel')
  @ApiOperation({
    summary: 'لغو گزارش سرقت/مفقودی توسط مالک (فقط پیش از تأیید مدیریت)',
  })
  cancelIncident(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelHologramIncidentDto,
  ) {
    return this.incidents.cancelByOwner(req.user.userId, id, dto.reason);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('transfer-requests')
  @ApiOperation({ summary: 'آغاز انتقال مالکیت شمش به فرد دیگر (فروش/هدیه)' })
  initiateTransfer(
    @Req() req: AuthenticatedRequest,
    @Body() dto: InitiateHologramTransferDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.transferService.initiateByUser(
      req.user.userId,
      dto,
      idempotencyKey,
    );
  }

  @Get('transfer-requests/incoming')
  @ApiOperation({
    summary:
      'درخواست‌های انتقال مالکیت در انتظار تأیید من (بر اساس شماره موبایل)',
  })
  listIncoming(@Req() req: AuthenticatedRequest) {
    return this.transferService.listIncoming(req.user.phone);
  }

  @OwnedResource({
    model: 'ownershipTransferRequest',
    ownerPath: 'recipientPhoneNumber',
    actorKey: 'phone',
  })
  @Get('transfer-requests/:id')
  @ApiOperation({ summary: 'جزئیات یک درخواست انتقال ورودی' })
  getOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.transferService.getOwn(req.user.phone, id);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @OwnedResource({
    model: 'ownershipTransferRequest',
    ownerPath: 'recipientPhoneNumber',
    actorKey: 'phone',
  })
  @Post('transfer-requests/:id/confirm')
  @ApiOperation({
    summary: 'تأیید انتقال مالکیت — نیازمند احراز هویت (KYC) گیرنده',
  })
  confirm(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ConfirmHologramTransferDto,
  ) {
    return this.transferService.confirm(
      req.user.userId,
      req.user.phone,
      id,
      dto,
    );
  }

  @OwnedResource({
    model: 'ownershipTransferRequest',
    ownerPath: 'recipientPhoneNumber',
    actorKey: 'phone',
  })
  @Post('transfer-requests/:id/reject')
  @ApiOperation({ summary: 'رد درخواست انتقال مالکیت' })
  reject(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: RejectHologramTransferDto,
  ) {
    return this.transferService.reject(req.user.phone, id, dto.reason);
  }
}
