import { IsString, IsOptional, Length, Matches } from 'class-validator';

export class UpdateLegalProfileDto {
  @IsString()
  @Length(2, 100)
  companyName!: string;

  @IsString()
  @Length(11, 11, { message: 'شناسه ملی باید ۱۱ رقم باشد' })
  @Matches(/^\d{11}$/, { message: 'شناسه ملی باید فقط عدد باشد' })
  nationalId!: string;

  @IsOptional()
  @IsString()
  @Length(12, 12, { message: 'کد اقتصادی باید ۱۲ رقم باشد' })
  economicCode?: string;

  @IsOptional()
  @IsString()
  registrationNumber?: string;
}