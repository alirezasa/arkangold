import { IsString, MaxLength, MinLength } from 'class-validator';

// تغییر رمز عبور توسط کاربر واردشده (نیازمند رمز فعلی)
export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  currentPassword!: string;

  // حداقل طول و سایر قواعد در سیاست واحد رمز عبور (PasswordPolicyService) بررسی می‌شود
  @IsString()
  @MinLength(1)
  @MaxLength(128, { message: 'رمز عبور حداکثر ۱۲۸ کاراکتر است' })
  newPassword!: string;
}
