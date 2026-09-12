import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpsertCredentialDto {
  @IsString()
  key!: string;

  @IsString()
  value!: string;
}

export class UpdateProviderServiceDto {
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(1) priority?: number;
  @IsOptional() @IsBoolean() isFallback?: boolean;
  @IsOptional() @IsObject() configuration?: Record<string, unknown>;
}

export class UpdateProviderDto {
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateServiceDto {
  @IsOptional() @IsBoolean() isActive?: boolean;
}
