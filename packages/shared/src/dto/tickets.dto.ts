// packages/shared/src/ticketsdto.ts
// دقیقاً هم‌الگو با SendOtpDto/LoginDto فعلی شما — class-validator + class-transformer

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  MaxLength,
  MinLength,
  IsBoolean,
  IsInt,
  Min,
  Max,
} from "class-validator";
import { Type } from "class-transformer";
import { TicketStatus, TicketPriority } from "../enums";

export class CreateTicketDto {
  @IsString()
  @IsNotEmpty()
  categoryId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  subject!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(10000)
  description!: string;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;
}

export class CreateTicketMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  message!: string;

  // فقط توسط ادمین قابل استفاده است؛ در Controller کاربر این فیلد نادیده گرفته می‌شود
  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;
}

export class AssignTicketDto {
  @IsString()
  @IsNotEmpty()
  adminId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ChangeTicketStatusDto {
  @IsEnum(TicketStatus)
  status!: TicketStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ChangeTicketPriorityDto {
  @IsEnum(TicketPriority)
  priority!: TicketPriority;
}

export class CloseTicketDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CreateTicketCategoryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  slug!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateTicketCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class ListTicketsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsOptional()
  @IsString()
  assignedAdminId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class RateTicketDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
