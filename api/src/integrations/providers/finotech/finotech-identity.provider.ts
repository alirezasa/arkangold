import { Injectable, Logger } from '@nestjs/common';
import * as jalaali from 'jalaali-js';
import { FinotechHttpClient } from './finotech-http.client';
import { FINOTECH_CONFIG, FINOTECH_PROVIDER_CODE } from './finotech-config';
import {
  IdentityVerificationInput,
  IdentityVerificationProvider,
  IdentityVerificationResult,
} from '../../interfaces/identity-verification.interface';
import {
  InvalidResponseError,
  ValidationError,
} from '../../errors/integration-error';

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
    trackingCode?: string | null;
    operationStatus?: string | null;
  };
  error?: { code?: string; message?: string };
}

/**
 * فقط بر اساس مستندات ارائه‌شده فینوتک برای «استعلام اطلاعات هویتی» پیاده شده است:
 *   GET /kyc/v2/clients/{clientId}/identificationInquiry?nationalCode&birthDate&trackId
 * هیچ Endpoint، Header یا فیلد دیگری که در مستندات نبوده حدس زده نشده.
 *
 * birthDate طبق مستندات فینوتک باید شمسی و به‌فرمت yyyy/mm/dd باشد، درحالی‌که ورودی
 * سیستم ما میلادی (yyyy-mm-dd) است؛ تبدیل با jalaali-js (که پروژه از قبل جای دیگری
 * استفاده می‌کند) در toJalaliSlashFormat انجام می‌شود — نیازی به نصب اضافه نیست چون
 * طبق نکات پروژه از قبل در package.json وجود دارد.
 */
@Injectable()
export class FinotechIdentityProvider implements IdentityVerificationProvider {
  readonly providerCode = FINOTECH_PROVIDER_CODE;
  private readonly logger = new Logger(FinotechIdentityProvider.name);

  constructor(private readonly http: FinotechHttpClient) {}

  async verifyIdentity(
    input: IdentityVerificationInput,
  ): Promise<IdentityVerificationResult> {
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
        reason:
          response.error.message ||
          'اطلاعات هویتی با سوابق ثبت احوال تطابق ندارد',
        providerRequestId: response.trackId,
      };
    }

    if (!response.result) {
      throw new InvalidResponseError('پاسخ فینوتک فاقد فیلد result بود');
    }

    // فینوتک برخی رشته‌ها را با فاصله اضافی برمی‌گرداند (مثلاً "زنده " با یک Space
    // انتهایی در نمونه واقعی Sandbox) — بدون trim، مقایسه دقیق رشته‌ای شکست می‌خورد
    const deathStatus = this.trim(response.result.deathStatus);
    if (deathStatus && deathStatus !== 'زنده') {
      return {
        matched: false,
        reason: 'وضعیت حیات ثبت‌شده زنده نیست',
        providerRequestId: response.trackId,
      };
    }

    return {
      matched: true,
      firstName: this.trim(response.result.firstName),
      lastName: this.trim(response.result.lastName),
      fatherName: this.trim(response.result.fatherName),
      deathStatus,
      gender: this.trim(response.result.gender),
      identityNo: response.result.identityNo,
      identitySeri: this.trim(response.result.identitySeri),
      identitySerial: this.trim(response.result.identitySerial),
      officeName: this.trim(response.result.officeName),
      officeCode: this.trim(response.result.officeCode),
      civilRegistryTrackingCode: this.trim(response.result.trackingCode),
      providerRequestId: response.trackId,
    };
  }

  private trim(value?: string | null): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  /**
   * ورودی می‌تواند «yyyy-mm-dd» خالص یا یک ISO string کامل («yyyy-mm-ddTHH:mm:ss.sssZ»
   * — مثلاً حاصل .toISOString() روی Date) باشد؛ در هر دو حالت فقط بخش تاریخ برداشته می‌شود.
   */
  private toJalaliSlashFormat(isoDate: string): string {
    const datePart = isoDate.split('T')[0];
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
    if (!match) {
      throw new ValidationError(
        `فرمت تاریخ تولد نامعتبر است: «${isoDate}» — فرمت مورد انتظار yyyy-mm-dd است`,
      );
    }

    const gy = Number(match[1]);
    const gm = Number(match[2]);
    const gd = Number(match[3]);

    const { jy, jm, jd } = jalaali.toJalaali(gy, gm, gd);
    return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
  }
}
