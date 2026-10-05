import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, Matches } from 'class-validator';
import { AdminJwtAuthGuard } from '../../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../../admin-auth/decorators/require-permission.decorator';
import { AuditLog } from '../../admin-auth/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../../admin-auth/interceptors/audit-log.interceptor';
import {
  CARD_NATIONAL_ID_MATCH_SERVICE_CODE,
  CARD_TO_IBAN_SERVICE_CODE,
  CardNationalIdMatchService,
  CardToIbanService,
  MOBILE_NATIONAL_ID_MATCH_SERVICE_CODE,
  MobileNationalIdMatchService,
} from '../services/kyc-inquiry.services';
import { IntegrationError } from '../errors/integration-error';
import { DEPOSIT_STATUS_LABELS } from '../interfaces/card-to-iban.interface';

class TestInquiryDto {
  @IsOptional()
  @IsString()
  @Matches(/^09\d{9}$/, { message: 'شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود' })
  mobile?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{10}$/, { message: 'کد ملی باید ۱۰ رقم باشد' })
  nationalCode?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{16}$/, { message: 'شماره کارت باید ۱۶ رقم باشد' })
  cardNumber?: string;
}

/**
 * استعلام آزمایشی از پنل ادمین (با Provider فعال فعلی) — برای اطمینان از درست کار کردن
 * هر وب‌سرویس پس از تنظیم Credential/Scope. فراخوانی واقعی و هزینه‌دار است، پس دسترسی
 * مدیریت + محدودیت نرخ + ثبت در گزارش فعالیت دارد.
 */
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@Controller('admin/integrations')
export class IntegrationsTestController {
  constructor(
    private readonly shahkar: MobileNationalIdMatchService,
    private readonly cardOwner: CardNationalIdMatchService,
    private readonly cardToIban: CardToIbanService,
  ) {}

  @Post('services/:code/test')
  @RequirePermission('integrations.manage')
  @AuditLog('integrations.service.test_inquiry')
  @UseInterceptors(AuditLogInterceptor)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async testInquiry(@Param('code') code: string, @Body() dto: TestInquiryDto) {
    const startedAt = Date.now();
    try {
      const data = await this.run(code, dto);
      return { success: true, durationMs: Date.now() - startedAt, ...data };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      return {
        success: false,
        durationMs: Date.now() - startedAt,
        errorCategory:
          err instanceof IntegrationError ? err.category : 'UNKNOWN_ERROR',
        message: (err as Error).message,
      };
    }
  }

  private async run(code: string, dto: TestInquiryDto) {
    switch (code) {
      case MOBILE_NATIONAL_ID_MATCH_SERVICE_CODE: {
        if (!dto.mobile || !dto.nationalCode) {
          throw new BadRequestException('موبایل و کد ملی را وارد کنید');
        }
        const r = await this.shahkar.match({
          mobile: dto.mobile,
          nationalCode: dto.nationalCode,
        });
        return {
          provider: r.verifiedByProvider,
          message: r.matched
            ? 'شماره موبایل متعلق به این کد ملی است'
            : 'عدم تطابق: شماره موبایل متعلق به این کد ملی نیست',
          result: { matched: r.matched, trackId: r.providerRequestId },
        };
      }
      case CARD_NATIONAL_ID_MATCH_SERVICE_CODE: {
        if (!dto.cardNumber || !dto.nationalCode) {
          throw new BadRequestException('شماره کارت و کد ملی را وارد کنید');
        }
        const r = await this.cardOwner.match({
          cardNumber: dto.cardNumber,
          nationalCode: dto.nationalCode,
        });
        return {
          provider: r.verifiedByProvider,
          message: r.matched
            ? 'کارت متعلق به این کد ملی است'
            : 'عدم تطابق: کارت متعلق به این کد ملی نیست',
          result: { matched: r.matched, trackId: r.providerRequestId },
        };
      }
      case CARD_TO_IBAN_SERVICE_CODE: {
        if (!dto.cardNumber) {
          throw new BadRequestException('شماره کارت را وارد کنید');
        }
        const r = await this.cardToIban.convert({ cardNumber: dto.cardNumber });
        return {
          provider: r.verifiedByProvider,
          message: r.found
            ? 'شماره شبا دریافت شد'
            : r.reason || 'شبا برای این کارت یافت نشد',
          result: {
            iban: r.iban ?? null,
            bankName: r.bankName ?? null,
            deposit: r.deposit ?? null,
            depositStatus: r.depositStatus ?? null,
            depositStatusLabel: r.depositStatus
              ? (DEPOSIT_STATUS_LABELS[r.depositStatus] ?? r.depositStatus)
              : null,
            depositOwners: r.depositOwners ?? null,
            trackId: r.providerRequestId,
          },
        };
      }
      default:
        throw new BadRequestException(
          'استعلام آزمایشی برای این سرویس پشتیبانی نمی‌شود',
        );
    }
  }
}
