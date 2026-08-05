import { IsUUID, IsString, IsOptional, IsIn, IsNumberString, ValidateIf } from 'class-validator';
import { PaymentMethod } from '../enums';

export class CreateShopOrderDto {
  @IsUUID()
  addressId!: string;
}

export type PaymentModeType = 'WALLET' | 'GATEWAY' | 'SPLIT';

export class PayShopOrderDto {
  @IsIn(['WALLET', 'GATEWAY', 'SPLIT'])
  mode!: PaymentModeType;

  // فقط وقتی GATEWAY یا SPLIT است لازم است
  @ValidateIf((o) => o.mode !== 'WALLET')
  @IsIn(['ZARINPAL', 'BEHPARDAKHT'])
  gatewayProvider?: 'ZARINPAL' | 'BEHPARDAKHT';

  // فقط برای SPLIT
  @ValidateIf((o) => o.mode === 'SPLIT')
  @IsNumberString()
  walletAmountRial?: string;

  @ValidateIf((o) => o.mode === 'SPLIT')
  @IsNumberString()
  gatewayAmountRial?: string;
}

export class ShipShopOrderDto {
  @IsString()
  carrierName!: string;

  @IsOptional()
  @IsString()
  trackingCode?: string;

  @IsOptional()
  @IsString()
  estimatedDelivery?: string;
}

export class CancelShopOrderDto {
  @IsOptional()
  @IsString()
  reason?: string;
}