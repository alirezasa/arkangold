import {
  IsString,
  Length,
  Matches,
  IsOptional,
  IsBoolean,
} from 'class-validator';

export class AddBankAccountDto {
  @IsString()
  @Length(16, 16, { message: 'شماره کارت باید ۱۶ رقم باشد' })
  @Matches(/^\d{16}$/, { message: 'شماره کارت باید فقط عدد باشد' })
  cardNumber!: string;

  @IsString()
  @Length(24, 26, { message: 'شماره شبا معتبر نیست' })
  @Matches(/^IR\d{24}$/, { message: 'شماره شبا باید با IR شروع شود' })
  sheba!: string;

  @IsString()
  @Length(2, 50)
  bankName!: string;

  @IsOptional()
  @IsString()
  @Length(10, 20)
  accountNumber?: string;
}

export class SetDefaultBankAccountDto {
  @IsString()
  accountId!: string;
}