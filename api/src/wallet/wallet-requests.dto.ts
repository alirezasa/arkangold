// api/src/wallet/wallet-requests.dto.ts
//
// FPT_ITT_EXT.1.1 / FPT_ITT_EXT.4.1 / FPT_ITT_EXT.5.3 — بدنه‌ی درخواست‌های کیف پول با کلاس DTO
// صریح اعتبارسنجی می‌شود (قبلاً با نوع درون‌خطی تعریف شده بود و ValidationPipe اصلاً اجرا
// نمی‌شد): فقط فیلدهای مجاز، شناسه‌ها UUID و مبالغ عدد صحیح مثبت در بازه‌ی امن.
import { Type } from 'class-transformer';
import { IsInt, IsPositive, IsUUID, Max } from 'class-validator';

/** بیشینه‌ی مبلغ (ریال) — کمتر از Number.MAX_SAFE_INTEGER تا محاسبات عددی سرریز نکنند */
export const MAX_AMOUNT_RIAL = 1_000_000_000_000_000;

const AMOUNT_MSG = 'مبلغ باید عدد صحیح مثبت باشد';

export class SourceCardDto {
  @IsUUID('all', { message: 'کارت مبدأ نامعتبر است' })
  sourceCardId!: string;
}

export class CardToCardInitiateDto extends SourceCardDto {
  @Type(() => Number)
  @IsInt({ message: AMOUNT_MSG })
  @IsPositive({ message: AMOUNT_MSG })
  @Max(MAX_AMOUNT_RIAL, { message: 'مبلغ بیش از حد مجاز است' })
  amount!: number;
}

export class WithdrawalRequestDto {
  @IsUUID('all', { message: 'حساب بانکی نامعتبر است' })
  bankAccountId!: string;

  @Type(() => Number)
  @IsInt({ message: AMOUNT_MSG })
  @IsPositive({ message: AMOUNT_MSG })
  @Max(MAX_AMOUNT_RIAL, { message: 'مبلغ بیش از حد مجاز است' })
  amountRial!: number;
}
