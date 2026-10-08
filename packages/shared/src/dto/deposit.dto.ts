// packages/shared/src/dto/deposit.dto.ts
import { Type } from 'class-transformer';
import {
  IsIn,
  IsUUID,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  IsDefined,
  

} from "class-validator";

export class CreateDepositRequestDto {
  @IsDefined({ message: "مبلغ الزامی است" })
  @Type(() => Number)
  @IsInt({ message: "مبلغ باید عدد صحیح باشد" })
  @Min(1, { message: "مبلغ باید بیشتر از صفر باشد" })
  amountRial!: number;
}

export class UploadDepositReceiptDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class ApproveDepositRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RejectDepositRequestDto {
  @IsString()
  @MinLength(10, { message: "دلیل رد باید حداقل ۱۰ کاراکتر باشد" })
  @MaxLength(500)
  reason!: string;
}

/**
 * ثبت واریز کارت به کارت / حساب به حساب پس از انجام واریز — درخواست با ارسال فیش
 * در صف بررسی قرار می‌گیرد و فقط پس از تأیید کارشناس کیف پول شارژ می‌شود.
 */
export class CreateManualDepositDto {
  @IsIn(["CARD_TO_CARD", "BANK_TRANSFER"], { message: "روش واریز معتبر نیست" })
  method!: "CARD_TO_CARD" | "BANK_TRANSFER";

  @IsDefined({ message: "مبلغ الزامی است" })
  @Type(() => Number)
  @IsInt({ message: "مبلغ باید عدد صحیح باشد" })
  @Min(1, { message: "مبلغ باید بیشتر از صفر باشد" })
  amountRial!: number;

  @IsUUID("all", { message: "کارت مبدأ نامعتبر است" })
  sourceCardId!: string;
}
