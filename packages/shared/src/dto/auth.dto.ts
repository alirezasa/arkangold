import { Transform } from 'class-transformer';
import { IsPhoneNumber, IsString, Length, MinLength, MaxLength, IsOptional, IsIn, Matches, } from 'class-validator';

export class SendOtpDto {
  @IsString()
  @IsPhoneNumber('IR')
  phone!: string;

  @IsOptional()
  @IsIn(['REAL', 'LEGAL'])
  type?: string;

  @IsOptional()
  @IsString()
  @Length(11, 11, { message: 'شناسه ملی باید ۱۱ رقم باشد' })
  companyNationalId?: string;
}

export class VerifyOtpDto {
  @IsString()
  @IsPhoneNumber('IR')
  phone!: string;

  @IsString()
  @Length(6, 6)
  code!: string;

  @IsOptional()
  @IsIn(['REAL', 'LEGAL'])
  type?: string;

  @IsOptional()
  @IsString()
  @Length(11, 11)
  companyNationalId?: string;
}

// FIA_UAU_EXT.1.1/1.9: حداقل طول، فهرست رمزهای رایج و … در سیاست واحد رمز عبور سمت API
// بررسی می‌شود؛ اینجا فقط سقف ۱۲۸ کاراکتر (بیش از ۶۴ کاراکتر الزامی) اعمال می‌شود.
export class SetPasswordDto {
  @IsString()
  tempToken!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128, { message: 'رمز عبور حداکثر ۱۲۸ کاراکتر است' })
  password!: string;

  // کد دعوت (از لینک دعوت یا ورود دستی) — فاصله‌ها حذف و به حروف بزرگ تبدیل می‌شود
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() || undefined : value,
  )
  @IsOptional()
  @IsString()
  @Length(8, 8, { message: 'کد معرف باید ۸ کاراکتر باشد' })
  referralCode?: string;
}

export class LoginDto {
  @IsString()
  @IsPhoneNumber('IR')
  phone!: string;

  @IsString()
  @MaxLength(256)
  password!: string;

  /** راه‌حل «بررسی امنیتی» (Proof-of-Work) — فقط وقتی سرور CAPTCHA_REQUIRED برگرداند */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  captcha?: string;
}

export class ForgotPasswordDto {
  @IsString()
  @IsPhoneNumber('IR')
  phone!: string;
}

export class ResetPasswordDto {
  @IsString()
  resetToken!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128, { message: 'رمز عبور حداکثر ۱۲۸ کاراکتر است' })
  password!: string;
}

export class RefreshTokenDto {
  @IsString()
  refreshToken!: string;
}

