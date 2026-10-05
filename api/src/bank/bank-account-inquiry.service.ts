import { Injectable, Logger } from '@nestjs/common';
import {
  CardNationalIdMatchService,
  CardToIbanService,
} from '../integrations/services/kyc-inquiry.services';
import {
  BLOCKED_DEPOSIT_STATUSES,
  DEPOSITABLE_STATUSES,
  DEPOSIT_STATUS_LABELS,
} from '../integrations/interfaces/card-to-iban.interface';
import { isValidIranIban, normalizeIban } from '../common/utils/iban.util';
import { BankInquiryService } from './bank-inquiry.service';

/** داده‌ای که از استعلام بانکی روی رکورد کارت نوشته می‌شود */
export interface BankInquiryData {
  cardOwnerMatched: boolean | null;
  sheba: string | null;
  accountNumber: string | null;
  bankName: string | null;
  ownerName: string | null;
  depositStatus: string | null;
  inquiryProvider: string | null;
  inquiryTrackId: string | null;
}

export type BankInquiryOutcome =
  /** کارت به نام کد ملی کاربر نیست */
  | { kind: 'OWNER_MISMATCH'; message: string; data: BankInquiryData }
  /** حساب متصل به کارت مسدود/راکد است و امکان واریز ندارد */
  | { kind: 'ACCOUNT_BLOCKED'; message: string; data: BankInquiryData }
  /** همه‌چیز تأیید شد و شبا تکمیل شد */
  | { kind: 'VERIFIED'; message: string; data: BankInquiryData }
  /** وب‌سرویس در دسترس نبود/پاسخ ناقص بود → بررسی کارشناس */
  | { kind: 'PENDING'; message: string; data: BankInquiryData };

/**
 * استعلام دو مرحله‌ای کارت بانکی:
 *   ۱) تطبیق شماره کارت با کد ملی (CARD_NATIONAL_ID_MATCH)
 *   ۲) تبدیل کارت به شبا (CARD_TO_IBAN) → شبا، شماره حساب، نام بانک، صاحب حساب، وضعیت حساب
 * هر خطای فنی/غیرفعال بودن سرویس به PENDING ختم می‌شود (کارت ثبت و در صف ادمین می‌رود)،
 * نه به رد شدن کارت.
 */
@Injectable()
export class BankAccountInquiryService {
  private readonly logger = new Logger(BankAccountInquiryService.name);

  constructor(
    private readonly cardOwner: CardNationalIdMatchService,
    private readonly cardToIban: CardToIbanService,
    private readonly bankInquiry: BankInquiryService,
  ) {}

  async inquire(
    cardNumber: string,
    nationalCode: string,
  ): Promise<BankInquiryOutcome> {
    const data: BankInquiryData = {
      cardOwnerMatched: null,
      sheba: null,
      accountNumber: null,
      bankName: null,
      ownerName: null,
      depositStatus: null,
      inquiryProvider: null,
      inquiryTrackId: null,
    };

    // ── ۱) تطبیق کارت با کد ملی ──
    try {
      const owner = await this.cardOwner.match({ cardNumber, nationalCode });
      data.cardOwnerMatched = owner.matched;
      data.inquiryProvider = owner.verifiedByProvider ?? null;
      data.inquiryTrackId = owner.providerRequestId ?? null;
      if (!owner.matched) {
        return {
          kind: 'OWNER_MISMATCH',
          message:
            'این کارت به نام شما نیست. فقط کارت بانکی‌ای قابل ثبت است که با کد ملی خودتان صادر شده باشد؛ لطفاً شماره کارتی که به نام خودتان است را وارد کنید',
          data,
        };
      }
    } catch (err) {
      this.logger.warn(
        `استعلام تطبیق کارت ${this.bankInquiry.maskCard(cardNumber)} ناموفق بود: ${(err as Error).message}`,
      );
      return {
        kind: 'PENDING',
        message:
          'سامانه استعلام بانکی در حال حاضر در دسترس نیست. کارت شما ثبت شد و پس از بررسی کارشناسان (معمولاً کمتر از یک روز کاری) فعال می‌شود',
        data,
      };
    }

    // ── ۲) تبدیل کارت به شبا ──
    try {
      const iban = await this.cardToIban.convert({ cardNumber });
      data.inquiryProvider = iban.verifiedByProvider ?? data.inquiryProvider;
      data.inquiryTrackId = iban.providerRequestId ?? data.inquiryTrackId;

      const sheba = iban.iban ? normalizeIban(iban.iban) : null;
      if (!iban.found || !sheba || !isValidIranIban(sheba)) {
        return {
          kind: 'PENDING',
          message:
            'مالکیت کارت تأیید شد ولی شماره شبای آن از بانک دریافت نشد. کارت ثبت شد و پس از بررسی کارشناسان فعال می‌شود',
          data,
        };
      }

      data.sheba = sheba;
      data.accountNumber = iban.deposit ?? null;
      data.ownerName = iban.depositOwners ?? null;
      data.depositStatus = iban.depositStatus ?? null;
      data.bankName = this.normalizeBankName(iban.bankName, sheba, cardNumber);

      const status = data.depositStatus;
      if (status && BLOCKED_DEPOSIT_STATUSES.includes(status)) {
        return {
          kind: 'ACCOUNT_BLOCKED',
          message: `حساب متصل به این کارت «${DEPOSIT_STATUS_LABELS[status]}» است و امکان واریز وجه به آن وجود ندارد. لطفاً کارت دیگری وارد کنید یا برای رفع مسدودی با بانک خود تماس بگیرید`,
          data,
        };
      }
      if (status && !DEPOSITABLE_STATUSES.includes(status)) {
        return {
          kind: 'PENDING',
          message: `وضعیت حساب از بانک به‌صورت «${DEPOSIT_STATUS_LABELS[status] ?? status}» اعلام شد. کارت ثبت شد و پس از بررسی کارشناسان فعال می‌شود`,
          data,
        };
      }

      return {
        kind: 'VERIFIED',
        message:
          'کارت بانکی تأیید شد؛ شماره شبا و اطلاعات حساب به‌صورت خودکار تکمیل شد',
        data,
      };
    } catch (err) {
      this.logger.warn(
        `تبدیل کارت ${this.bankInquiry.maskCard(cardNumber)} به شبا ناموفق بود: ${(err as Error).message}`,
      );
      return {
        kind: 'PENDING',
        message:
          'مالکیت کارت تأیید شد ولی سامانه دریافت شبا در دسترس نیست. کارت ثبت شد و پس از بررسی کارشناسان فعال می‌شود',
        data,
      };
    }
  }

  /** نام بانک: پاسخ Provider (با پیشوند «بانک» در صورت نیاز) ← کد بانک شبا ← BIN کارت */
  private normalizeBankName(
    providerName: string | undefined,
    sheba: string,
    cardNumber: string,
  ): string {
    const name = providerName?.trim();
    if (name) return name.startsWith('بانک') ? name : `بانک ${name}`;
    const bySheba = this.bankInquiry.detectBankBySheba(sheba);
    if (bySheba !== 'بانک نامشخص') return bySheba;
    return this.bankInquiry.detectBankByCard(cardNumber);
  }
}
