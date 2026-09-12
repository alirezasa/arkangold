// packages/shared/src/dto/deposit.dto.ts
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  IsDefined,
  

} from "class-validator";

export class CreateDepositRequestDto {
  @IsDefined({ message: "مبلغ الزامی است" })
  @Type(() => Number)
  @IsInt({ message: "مبلغ باید عدد صحیح باشد" })
  @Min(1, { message: "مبلغ باید بیشتر از صفر باشد" })
  amountRial!: number;
}

export class UploadDepositReceiptDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class ApproveDepositRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RejectDepositRequestDto {
  @IsString()
  @MinLength(10, { message: "دلیل رد باید حداقل ۱۰ کاراکتر باشد" })
  @MaxLength(500)
  reason!: string;
}
