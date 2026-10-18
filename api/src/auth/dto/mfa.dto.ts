import {
  IsOptional,
  IsPhoneNumber,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

/** مرحله‌ی دوم ورود یا بازنشانی رمز: کد پیامکی، کد برنامه‌ی احراز هویت یا کد بازیابی */
export class ChallengeCodeDto {
  @IsString()
  @MaxLength(100)
  challengeToken!: string;

  @IsString()
  @Length(6, 20)
  code!: string;
}

export class ChallengeTokenDto {
  @IsString()
  @MaxLength(100)
  challengeToken!: string;
}

/** راه‌اندازی/غیرفعال‌سازی ورود دومرحله‌ای نیازمند رمز عبور فعلی است */
export class MfaPasswordDto {
  @IsString()
  @MaxLength(256)
  password!: string;
}

export class MfaCodeDto {
  @IsString()
  @Length(6, 20)
  code!: string;
}

export class MfaDisableDto {
  @IsString()
  @MaxLength(256)
  password!: string;

  @IsString()
  @Length(6, 20)
  code!: string;
}

export class SendOtpCaptchaDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  captcha?: string;
}

/** ورود با کد پیامکی (بدون رمز): فقط شماره و در صورت نیاز راه‌حل بررسی امنیتی */
export class LoginOtpRequestDto {
  @IsString()
  @IsPhoneNumber('IR')
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  captcha?: string;
}
