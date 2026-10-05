import {
  IsString,
  Length,
  Matches,
  IsOptional,
} from 'class-validator';

/**
 * ثبت کارت بانکی: کاربر فقط شماره کارت را وارد می‌کند؛ مالکیت کارت با کد ملی او
 * استعلام و شبا، شماره حساب و نام بانک خودکار از وب‌سرویس تکمیل می‌شود.
 */
export class AddBankAccountDto {
  @IsString()
  @Length(16, 16, { message: 'شماره کارت باید ۱۶ رقم باشد' })
  @Matches(/^\d{16}$/, { message: 'شماره کارت باید فقط عدد باشد' })
  cardNumber!: string;

  // فیلدهای قدیمی فرم (نسخه‌های قبلی اپ) — پذیرفته ولی نادیده گرفته می‌شوند؛
  // مقدار واقعی از استعلام بانکی تکمیل می‌شود
  @IsOptional()
  @IsString()
  sheba?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;
}

export class SetDefaultBankAccountDto {
  @IsString()
  accountId!: string;
}
