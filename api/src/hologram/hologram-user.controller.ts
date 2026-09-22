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
import { extractClientIp } from './hologram-ip.util';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConfirmHologramTransferDto,
  HologramInquiryChannel,
  InitiateHologramTransferDto,
  RejectHologramTransferDto,
  VerifyHologramCodeDto,
} from '@arkan-gold/shared';

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
    private readonly prisma: PrismaService,
  ) {}

  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @Post('verify')
  @ApiOperation({
    summary: 'استعلام اصالت از داخل پنل کاربری (نمایش کامل کد ملی مالک)',
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
    return { data: ownerships };
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

  @Get('transfer-requests/:id')
  @ApiOperation({ summary: 'جزئیات یک درخواست انتقال ورودی' })
  getOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.transferService.getOwn(req.user.phone, id);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
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
