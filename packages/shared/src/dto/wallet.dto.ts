import { IsString, IsNumber, IsOptional, Min, IsIn } from 'class-validator';

export class DepositCardToCardDto {
  @IsNumber()
  @Min(10000)
  amount!: number;

  @IsString()
  sourceCardId!: string; // ID کارت مبدا از bank_accounts کاربر
}

export class DepositBankTransferDto {
  @IsString()
  sourceCardId!: string;
}

export class DepositTrackingIdDto {
  @IsString()
  sourceCardId!: string;
}

export class DepositLargeTransferDto {
  @IsNumber()
  @Min(1000000)
  amount!: number;
}

export class DepositDirectDto {
  @IsString()
  sourceCardId!: string;
}

export class WithdrawalRequestDto {
  @IsNumber()
  @Min(10000)
  amountRial!: number;

  @IsString()
  bankAccountId!: string;
}

export class DepositOnlineDto {
  @IsNumber()
  @Min(10000)
  amount!: number;
}