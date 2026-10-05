import { Injectable, Logger } from '@nestjs/common';
import {
  MobileNationalIdMatchInput,
  MobileNationalIdMatchProvider,
  MobileNationalIdMatchResult,
} from '../../interfaces/mobile-national-id-match.interface';
import {
  CardNationalIdMatchInput,
  CardNationalIdMatchProvider,
  CardNationalIdMatchResult,
} from '../../interfaces/card-national-id-match.interface';
import {
  CardToIbanInput,
  CardToIbanProvider,
  CardToIbanResult,
} from '../../interfaces/card-to-iban.interface';

/**
 * Providerهای شبیه‌سازی‌شده‌ی استعلام‌های KYC برای dev/staging.
 * برای تست مسیرهای «عدم تطابق» بدون فینوتک:
 *   - شاهکار: موبایلی که به 9999 ختم شود → عدم تطابق
 *   - تطبیق کارت: کارتی که به 0000 ختم شود → عدم تطابق
 *   - تبدیل کارت به شبا: کارتی که به 1111 ختم شود → حساب «مسدود بدون قابلیت واریز» (04)
 */
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

@Injectable()
export class MockShahkarProvider implements MobileNationalIdMatchProvider {
  readonly providerCode = 'MOCK';
  private readonly logger = new Logger(MockShahkarProvider.name);

  async match(
    input: MobileNationalIdMatchInput,
  ): Promise<MobileNationalIdMatchResult> {
    this.logger.log(`[MOCK] شاهکار: ${input.mobile.slice(0, 4)}***${input.mobile.slice(-2)}`);
    await delay(250);
    const matched = !input.mobile.endsWith('9999');
    return {
      matched,
      reason: matched ? undefined : 'شماره موبایل متعلق به این کد ملی نیست',
      providerRequestId: `mock-shahkar-${Date.now()}`,
    };
  }
}

@Injectable()
export class MockCardOwnerProvider implements CardNationalIdMatchProvider {
  readonly providerCode = 'MOCK';

  async match(
    input: CardNationalIdMatchInput,
  ): Promise<CardNationalIdMatchResult> {
    await delay(300);
    const matched = !input.cardNumber.endsWith('0000');
    return {
      matched,
      reason: matched ? undefined : 'کارت متعلق به این کد ملی نیست',
      providerRequestId: `mock-cardowner-${Date.now()}`,
    };
  }
}

// کد بانک در شبا (۳ رقم پس از رقم کنترل) بر اساس BIN کارت — فقط برای تولید شبای ساختگی معتبر
const MOCK_BIN_TO_IBAN_BANK: Record<string, [string, string]> = {
  '603799': ['017', 'ملی'],
  '610433': ['012', 'ملت'],
  '589210': ['015', 'سپه'],
  '603769': ['016', 'صادرات'],
  '627353': ['018', 'تجارت'],
  '621986': ['056', 'سامان'],
  '622106': ['054', 'پارسیان'],
  '603770': ['016', 'کشاورزی'],
  '589463': ['013', 'رفاه'],
  '502229': ['057', 'پاسارگاد'],
  '639347': ['057', 'پاسارگاد'],
};

@Injectable()
export class MockCardToIbanProvider implements CardToIbanProvider {
  readonly providerCode = 'MOCK';

  async convert(input: CardToIbanInput): Promise<CardToIbanResult> {
    await delay(300);
    const [bankCode, bankName] = MOCK_BIN_TO_IBAN_BANK[
      input.cardNumber.slice(0, 6)
    ] ?? ['017', 'ملی'];
    // ۱۹ رقم حساب ساختگی ولی ثابت برای هر کارت
    const account = `0${input.cardNumber}${input.cardNumber.slice(-2)}`.slice(0, 19);
    const bban = `${bankCode}${account}`;
    const check = 98 - Number(mod97(`${bban}182700`));
    const iban = `IR${String(check).padStart(2, '0')}${bban}`;
    return {
      found: true,
      iban,
      bankName,
      deposit: `${account.slice(-10, -3)}.${account.slice(-3)}`,
      depositStatus: input.cardNumber.endsWith('1111') ? '04' : '02',
      depositOwners: 'دارنده‌ی آزمایشی',
      providerRequestId: `mock-card2iban-${Date.now()}`,
    };
  }
}

function mod97(numeric: string): number {
  let remainder = 0;
  for (const ch of numeric) {
    remainder = (remainder * 10 + Number(ch)) % 97;
  }
  return remainder;
}
