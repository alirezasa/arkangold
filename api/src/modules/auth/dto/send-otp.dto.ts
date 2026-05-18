import { IsString, IsEnum, Matches } from 'class-validator';
import { OtpType } from '@prisma/client';

export class SendOtpDto {
  @IsString()
  @Matches(/^(?:\+989|09)\d{9}$/, {
    message: 'شماره موبایل باید معتبر و به صورت 09xxxxxxxxx باشد',
  })
  mobile!: string;

  @IsEnum(OtpType)
  type!: OtpType;
}
