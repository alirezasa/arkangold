import { Injectable, Logger } from '@nestjs/common';
import { FinotechHttpClient } from './finotech-http.client';
import { FINOTECH_CONFIG, FINOTECH_PROVIDER_CODE } from './finotech-config';
import {
  IdentityVerificationInput,
  IdentityVerificationProvider,
  IdentityVerificationResult,
} from '../../interfaces/identity-verification.interface';
import { InvalidResponseError, ValidationError } from '../../errors/integration-error';

interface FinotechIdentityInquiryResponse {
  responseCode?: string;
  trackId?: string;
  status?: string;
  result?: {
    firstName?: string;
    lastName?: string;
    birthDate?: string;
    fatherName?: string;
    deathStatus?: string;
    nationalId?: string;
    gender?: string;
    identityNo?: number;
    identitySeri?: string;
    identitySerial?: string;
    officeName?: string;
    officeCode?: string;
  };
  error?: { code?: string; message?: string };
}

/**
 * فقط بر اساس مستندات ارائه‌شده فینوتک برای «استعلام اطلاعات هویتی» پیاده شده است:
 *   GET /kyc/v2/clients/{clientId}/identificationInquiry?nationalCode&birthDate&trackId
 * هیچ Endpoint، Header یا فیلد دیگری که در مستندات نبوده حدس زده نشده.
 *
 * نکته مهم: birthDate طبق مستندات فینوتک باید شمسی و به‌فرمت yyyy/mm/dd باشد،
 * درحالی‌که ورودی سیستم ما میلادی (yyyy-mm-dd) است. تبدیل دقیق تقویم را نباید دستی
 * پیاده کرد (منبع خطای رایج) — باید از یک کتابخانه معتبر مثل jalaali-js استفاده شود؛
 * این پکیج در حال حاضر در پروژه نصب نیست، پس این متد فعلاً عمداً خطا می‌دهد تا کسی
 * تاریخ اشتباه به فینوتک نفرستد. راهنمای نصب در docs/INTEGRATION_SETUP.md آمده.
 */
@Injectable()
export class FinotechIdentityProvider implements IdentityVerificationProvider {
  readonly providerCode = FINOTECH_PROVIDER_CODE;
  private readonly logger = new Logger(FinotechIdentityProvider.name);

  constructor(private readonly http: FinotechHttpClient) {}

  async verifyIdentity(input: IdentityVerificationInput): Promise<IdentityVerificationResult> {
    if (!/^\d{10}$/.test(input.nationalCode)) {
      throw new ValidationError('کد ملی باید ۱۰ رقم باشد');
    }

    const clientId = process.env.FINOTECH_CLIENT_APP_ID;
    if (!clientId) {
      throw new ValidationError('FINOTECH_CLIENT_APP_ID در env تنظیم نشده است');
    }

    const jalaliBirthDate = this.toJalaliSlashFormat(input.birthDate);

    const response = await this.http.get<FinotechIdentityInquiryResponse>(
      FINOTECH_CONFIG.IDENTITY_INQUIRY_PATH(clientId),
      {
        nationalCode: input.nationalCode,
        birthDate: jalaliBirthDate,
        trackId: `identity-${input.nationalCode}-${Date.now()}`.slice(0, 40),
      },
    );

    if (response.error) {
      // فینوتک برای «عدم تطابق»/«یافت نشد» کد خطای اختصاصی برمی‌گرداند؛
      // این یک نتیجه Business است نه خطای فنی → matched:false، نه throw
      return {
        matched: false,
        reason: response.error.message || 'اطلاعات هویتی با سوابق ثبت احوال تطابق ندارد',
        providerRequestId: response.trackId,
      };
    }

    if (!response.result) {
      throw new InvalidResponseError('پاسخ فینوتک فاقد فیلد result بود');
    }

    if (response.result.deathStatus && response.result.deathStatus !== 'زنده') {
      return { matched: false, reason: 'وضعیت حیات ثبت‌شده زنده نیست', providerRequestId: response.trackId };
    }

    return {
      matched: true,
      firstName: response.result.firstName,
      lastName: response.result.lastName,
      fatherName: response.result.fatherName,
      deathStatus: response.result.deathStatus,
      gender: response.result.gender,
      providerRequestId: response.trackId,
    };
  }

  private toJalaliSlashFormat(isoDate: string): string {
    // TODO: بعد از نصب jalaali-js این پیاده‌سازی را جایگزین کن:
    //
    //   import jalaali from 'jalaali-js';
    //   const [gy, gm, gd] = isoDate.split('-').map(Number);
    //   const { jy, jm, jd } = jalaali.toJalaali(gy, gm, gd);
    //   return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
    //
    void isoDate;
    throw new ValidationError(
      'تبدیل تاریخ میلادی به شمسی هنوز پیاده‌سازی نشده — پکیج jalaali-js را نصب و این متد را طبق راهنمای بالا تکمیل کن',
    );
  }
}
