// admin/app/api/_lib/api.ts
//
// نمونه‌ی مستقل. اگر ابزار مشترک فراخوانی API را از قبل در پنل ادمین دارید
// (مثلاً همان چیزی که در admin/app/(dashboard)/users/[id]/page.tsx پشت صحنه
// axios.get('/api/admin/users/...') استفاده می‌کند)، همان الگو را نگه دارید
// و این فایل را فقط برای مسیر جدید /api/admin/tickets استفاده کنید.

import { cookies } from 'next/headers';

const API_BASE_URL =
  process.env.API_BASE_URL ??
  (process.env.NODE_ENV === 'production'
    ? 'https://api.arkan.gold'
    : 'http://localhost:5000');

export async function proxyToApi(
  path: string,
  init: RequestInit & { isFormData?: boolean } = {},
): Promise<Response> {
  const cookieStore = await cookies();
  const adminToken = cookieStore.get('adminAccessToken')?.value; // نام کوکی را هماهنگ کنید

  const headers: Record<string, string> = {
    ...(init.isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
  };

  return fetch(`${API_BASE_URL}${path}`, { ...init, headers, cache: 'no-store' });
}
