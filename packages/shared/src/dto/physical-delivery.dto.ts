import { IsString, IsNumber, IsOptional, Min, IsUUID } from 'class-validator';

export class CreatePhysicalDeliveryDto {
  @IsUUID()
  addressId!: string;

  @IsNumber()
  @Min(0.01)
  amountGrams!: number;
}

export class ShipPhysicalDeliveryDto {
  @IsString()
  trackingCode!: string;
}

export class PhysicalDeliveryAdminNoteDto {
  @IsOptional()
  @IsString()
  reason?: string;
}