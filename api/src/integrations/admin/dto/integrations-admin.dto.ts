import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsObject,
} from 'class-validator';
import { Prisma } from '../../../generated/prisma'; // یا از مسیر کلاینت اختصاصی '../generated/prisma'

export class UpdateServiceDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateProviderDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateProviderServiceDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  isFallback?: boolean;

  @IsOptional()
  @IsObject()
  configuration?: Prisma.InputJsonValue; // ✅ هماهنگ با تایپ سرویس و پریزما
}

export class UpsertCredentialDto {
  @IsString()
  key: string;

  @IsString()
  value: string;
}
