// packages/shared/src/dto/deposit.dto.ts

import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateDepositRequestDto {
  @IsInt({ message: 'مبلغ باید عدد صحیح ریالی باشد' })
  @Min(1, { message: 'مبلغ معتبر نیست' })
  amountRial!: number;
}

export class UploadDepositReceiptDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class ApproveDepositRequestDto {
  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

export class RejectDepositRequestDto {
  @IsString()
  @MinLength(10, { message: 'دلیل رد باید حداقل ۱۰ کاراکتر باشد' })
  @MaxLength(500)
  reason!: string;
}
