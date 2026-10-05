// api/src/common/auth-security/account-hygiene.ts
import { BadRequestException } from '@nestjs/common';
import { randomInt } from 'crypto';

/**
 * FIA_UAU_EXT.2.2: نام‌های کاربری پیش‌فرض و قابل حدس برای حساب‌های پنل مجاز نیستند.
 * هیچ حساب پیش‌فرضی در محصول ساخته نمی‌شود؛ این فهرست مانع ساختن آن‌ها به‌صورت دستی است.
 */
export const RESERVED_USERNAMES = [
  'admin',
  'administrator',
  'admins',
  'root',
  'sa',
  'sysadmin',
  'system',
  'superadmin',
  'super_admin',
  'superuser',
  'guest',
  'test',
  'tester',
  'demo',
  'user',
  'operator',
  'manager',
  'support',
  'default',
  'master',
  'owner',
  'webmaster',
  'postmaster',
  'info',
  'arkan',
  'arkangold',
];

export function isReservedUsername(username: string): boolean {
  const u = username
    .trim()
    .toLowerCase()
    .replace(/[\s._-]+/g, '');
  if (/^(admin|root|test|guest|user)\d*$/.test(u)) return true;
  return RESERVED_USERNAMES.some((r) => u === r.replace(/[\s._-]+/g, ''));
}

export function assertUsernameAllowed(username: string) {
  if (isReservedUsername(username)) {
    throw new BadRequestException(
      'این نام کاربری پیش‌فرض یا قابل حدس است و مجاز نیست؛ از نام کاربری شخصی (مثلاً r.ahmadi) استفاده کنید',
    );
  }
}

/**
 * FIA_UID_EXT.1.1: رمز موقت تولیدی سیستم — ۱۶ کاراکتر از الفبای ۵۷تایی بدون حروف مبهم
 * (حدود ۹۳ بیت آنتروپی) با CSPRNG، در چهار گروه برای خوانایی در پیامک.
 */
const TEMP_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
export const TEMP_PASSWORD_TTL_HOURS = 24;

export function generateTempPassword(): string {
  let s = '';
  for (let i = 0; i < 16; i++)
    s += TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}-${s.slice(12)}`;
}
