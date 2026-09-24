import { IsString, MaxLength, MinLength } from 'class-validator';

// تغییر رمز عبور توسط کاربر واردشده (نیازمند رمز فعلی)
export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  currentPassword!: string;

  @IsString()
  @MinLength(6, { message: 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد' })
  @MaxLength(50)
  newPassword!: string;
}
