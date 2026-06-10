import { IsNumber, IsString, Min, Max, IsOptional } from 'class-validator';

export class GatewayDepositDto {
  @IsNumber()
  @Min(5000, { message: 'حداقل مبلغ واریز ۵,۰۰۰ تومان است' })
  @Max(400_000_000, { message: 'سقف واریز درگاه ۴۰۰ میلیون تومان است' })
  amountRial!: number;
}

export class ConfirmGatewayDepositDto {
  @IsString()
  referenceCode!: string;

  @IsNumber()
  @Min(1)
  amountRial!: number;

  @IsString()
  authority!: string;
}

export class ShebaDepositInfoDto {
  @IsOptional()
  @IsString()
  bankAccountId?: string;
}