import { Injectable, Logger } from '@nestjs/common';
import {
  IdentityVerificationInput,
  IdentityVerificationProvider,
  IdentityVerificationResult,
} from '../../interfaces/identity-verification.interface';

/**
 * این Provider همان منطق قبلی api/src/users/civil-registry.service.ts است که بدون
 * هیچ تغییر رفتاری به معماری Provider-based منتقل شده — تا Migration کاملاً بدون ریسک باشد.
 * در dev/staging به‌عنوان Primary باقی می‌ماند؛ برای Production باید Priority آن پایین‌تر
 * از FINOTECH تنظیم شود یا غیرفعال شود (از پنل ادمین).
 */
@Injectable()
export class MockIdentityProvider implements IdentityVerificationProvider {
  readonly providerCode = 'MOCK';
  private readonly logger = new Logger(MockIdentityProvider.name);

  async verifyIdentity(input: IdentityVerificationInput): Promise<IdentityVerificationResult> {
    this.logger.log(`[MOCK] استعلام هویتی: ${input.nationalCode}`);

    if (!this.isValidNationalCode(input.nationalCode)) {
      return { matched: false, reason: 'کد ملی از نظر الگوریتمی نامعتبر است' };
    }

    // شبیه‌سازی تاخیر شبکه — دقیقاً مطابق نسخه قبلی
    await this.delay(300);

    return {
      matched: true,
      firstName: input.firstName,
      lastName: input.lastName,
    };
  }

  private isValidNationalCode(code: string): boolean {
    if (!/^\d{10}$/.test(code)) return false;
    if (/^(\d)\1{9}$/.test(code)) return false; // مثل 1111111111

    const digits = code.split('').map(Number);
    const check = digits[9];
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += digits[i] * (10 - i);
    }
    const remainder = sum % 11;
    return remainder < 2 ? check === remainder : check === 11 - remainder;
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
