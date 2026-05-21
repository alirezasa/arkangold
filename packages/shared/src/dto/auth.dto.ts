import { IsPhoneNumber, IsString, Length, MinLength, MaxLength, IsOptional, IsIn } from 'class-validator';

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

export class SetPasswordDto {
  @IsString()
  tempToken!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(50)
  password!: string;

  @IsOptional()
  @IsString()
  @Length(8, 8)
  referralCode?: string;
}

export class LoginDto {
  @IsString()
  @IsPhoneNumber('IR')
  phone!: string;

  @IsString()
  password!: string;
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
  @MinLength(6)
  @MaxLength(50)
  password!: string;
}

export class RefreshTokenDto {
  @IsString()
  refreshToken!: string;
}