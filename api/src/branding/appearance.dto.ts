// api/src/branding/appearance.dto.ts
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAppearanceDto {
  /** نگاشت کلید رنگ → hex (#rrggbb)؛ کلیدها و مقادیر در سرویس اعتبارسنجی می‌شوند */
  @IsOptional()
  @IsObject()
  colors?: Record<string, unknown>;

  /** نام نمایشی فونت سفارشی (فقط برای نمایش در پنل؛ وارد CSS نمی‌شود) */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  fontName?: string;
}
