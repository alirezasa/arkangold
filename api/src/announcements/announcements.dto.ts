// api/src/announcements/announcements.dto.ts
import {
  ArrayNotEmpty,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export const ANNOUNCEMENT_LEVELS = [
  'INFO',
  'SUCCESS',
  'WARNING',
  'PROMO',
] as const;
export const ANNOUNCEMENT_AUDIENCES = ['ALL', 'SELECTED'] as const;

export type AnnouncementLevelValue = (typeof ANNOUNCEMENT_LEVELS)[number];
export type AnnouncementAudienceValue = (typeof ANNOUNCEMENT_AUDIENCES)[number];

export class CreateAnnouncementDto {
  @IsString()
  @Length(2, 150)
  title!: string;

  @IsString()
  @Length(2, 2000)
  body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  link?: string;

  @IsOptional()
  @IsIn(ANNOUNCEMENT_LEVELS)
  level?: AnnouncementLevelValue;

  @IsOptional()
  @IsIn(ANNOUNCEMENT_AUDIENCES)
  audience?: AnnouncementAudienceValue;

  /** کاربران دریافت‌کننده — فقط برای audience = SELECTED */
  @ValidateIf((o: CreateAnnouncementDto) => o.audience === 'SELECTED')
  @ArrayNotEmpty({ message: 'حداقل یک کاربر دریافت‌کننده انتخاب کنید' })
  @IsUUID(undefined, { each: true })
  userIds?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDateString()
  publishedAt?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class UpdateAnnouncementDto {
  @IsOptional()
  @IsString()
  @Length(2, 150)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  link?: string;

  @IsOptional()
  @IsIn(ANNOUNCEMENT_LEVELS)
  level?: AnnouncementLevelValue;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;
}
