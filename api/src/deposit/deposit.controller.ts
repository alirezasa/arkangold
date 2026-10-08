import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { DepositService } from './deposit.service';
import type { DepositStatusValue } from './deposit.state';
import {
  CreateDepositRequestDto,
  CreateManualDepositDto,
} from '@arkan-gold/shared';
import { OwnedResource } from '../common/audit/owned-resource.decorator';

interface AuthedRequest extends Request {
  user: {
    userId: string;
    phone: string;
    sessionId: string;
  };
}

@ApiTags('Wallet/Deposits')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveUserGuard)
@Controller('wallet/deposits')
export class DepositController {
  constructor(private readonly depositService: DepositService) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'ایجاد درخواست واریز و صدور پیش‌فاکتور',
  })
  create(
    @Req() req: AuthedRequest,
    @Body() dto: CreateDepositRequestDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.depositService.create(
      req.user.userId,
      dto.amountRial,
      idempotencyKey,
    );
  }

  // ⚠ پیش از مسیرهای :id تعریف شود
  @Post('manual')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'ثبت واریز کارت به کارت / حساب به حساب پس از انجام واریز (سپس ارسال فیش و بررسی کارشناس)',
  })
  createManual(
    @Req() req: AuthedRequest,
    @Body() dto: CreateManualDepositDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.depositService.createManual(
      req.user.userId,
      dto,
      idempotencyKey,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'فهرست درخواست‌های واریز کاربر',
  })
  list(
    @Req() req: AuthedRequest,
    @Query('status') status?: DepositStatusValue,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.depositService.list(req.user.userId, {
      status,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @OwnedResource({ model: 'depositRequest', ownerPath: 'userId' })
  @Get(':id')
  @ApiOperation({
    summary: 'جزئیات درخواست واریز',
  })
  getOne(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.depositService.getOne(req.user.userId, id);
  }

  @OwnedResource({ model: 'depositRequest', ownerPath: 'userId' })
  @Post(':id/receipt')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1,
      },
    }),
  )
  @ApiOperation({
    summary: 'ارسال فیش واریزی',
  })
  uploadReceipt(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('description') description?: string,
  ) {
    if (!file) {
      throw new BadRequestException('تصویر فیش را انتخاب کنید');
    }
    // FPT_ITT_EXT.1.1 — فیلد متنی multipart هم اعتبارسنجی می‌شود
    if (
      description !== undefined &&
      (typeof description !== 'string' || description.length > 500)
    ) {
      throw new BadRequestException('توضیحات حداکثر ۵۰۰ کاراکتر است');
    }

    return this.depositService.uploadReceipt(
      req.user.userId,
      id,
      file,
      description,
    );
  }

  @OwnedResource({ model: 'depositRequest', ownerPath: 'userId' })
  @Get(':id/receipts/:receiptId/url')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'لینک موقت مشاهده رسید توسط خود کاربر',
  })
  receiptUrl(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('receiptId') receiptId: string,
  ) {
    return this.depositService.getReceiptUrl(req.user.userId, id, receiptId);
  }

  @OwnedResource({ model: 'depositRequest', ownerPath: 'userId' })
  @Post(':id/cancel')
  @ApiOperation({
    summary: 'لغو درخواست واریز',
  })
  cancel(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.depositService.cancel(req.user.userId, id);
  }
}
