import { IsString, IsEnum, Matches } from 'class-validator';
import { OtpType } from '@prisma/client';

export class VerifyOtpDto {
  @IsString()
  @Matches(/^(?:\+989|09)\d{9}$/, {
    message: 'شماره موبایل باید معتبر و به صورت 09xxxxxxxxx باشد',
  })
  mobile!: string;

  @IsString()
  code!: string;

  @IsEnum(OtpType)
  type!: OtpType;
}
