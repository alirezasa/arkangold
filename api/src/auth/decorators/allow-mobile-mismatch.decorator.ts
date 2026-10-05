import { SetMetadata } from '@nestjs/common';

export const ALLOW_MOBILE_MISMATCH_KEY = 'allowMobileMismatch';

/**
 * ActiveUserGuard کاربرِ دارای شماره‌ی ناهمخوان با شاهکار (MISMATCH) را از همه‌ی امکانات
 * منع می‌کند؛ این Decorator مسیرهایی را که باید در همان حالت هم در دسترس بمانند
 * (مثل پشتیبانی) مستثنی می‌کند.
 */
export const AllowMobileMismatch = () =>
  SetMetadata(ALLOW_MOBILE_MISMATCH_KEY, true);
