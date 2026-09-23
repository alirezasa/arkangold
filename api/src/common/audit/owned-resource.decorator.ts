// api/src/common/audit/owned-resource.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const OWNED_RESOURCE_KEY = 'ownedResource';

export interface OwnedResourceOptions {
  /** نام delegate مدل Prisma، مثلاً 'invoice' */
  model: string;
  /** پارامتر مسیر حاوی شناسه‌ی منبع؛ پیش‌فرض 'id' */
  param?: string;
  /** مسیر فیلد مالک روی مدل، می‌تواند تودرتو باشد: 'userId' یا 'cart.userId' */
  ownerPath: string;
  /** با کدام ویژگی کاربر احراز‌شده مقایسه شود؛ پیش‌فرض 'userId' */
  actorKey?: 'userId' | 'phone';
}

/**
 * FAU_GEN_EXT.1.6 بند ۲: منبع متعلق به کاربر را اعلام می‌کند تا اگر درخواست با 404/403
 * رد شد، HorizontalAccessInterceptor بررسی کند منبع وجود دارد و متعلق به کاربر دیگری است
 * (تلاش دسترسی هم‌سطح) و آن را ثبت کند. روی مسیر موفق هیچ کوئری اضافه‌ای اجرا نمی‌شود.
 */
export const OwnedResource = (options: OwnedResourceOptions) =>
  SetMetadata(OWNED_RESOURCE_KEY, options);
