import { IsUUID, IsString, IsOptional, IsIn } from 'class-validator';
import { PaymentMethod } from '../enums';

export class CreateShopOrderDto {
  @IsUUID()
  addressId!: string;
}

export class PayShopOrderDto {
  @IsIn(Object.values(PaymentMethod))
  method!: PaymentMethod;
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