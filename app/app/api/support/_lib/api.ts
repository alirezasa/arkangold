// app/app/api/support/_lib/api.ts
//
// این یک پروکسی عمومی BFF است. اگر در پروژه‌تان از قبل یک ابزار مشترک برای صدا زدن
// api (مثلاً یک axios instance یا تابع serverFetch با مدیریت refresh-token) دارید،
// حتماً از همان استفاده کنید و این فایل را با آن جایگزین کنید — این فقط یک نمونه‌ی
// مستقل و کارکننده است تا الگوی BFF فعلی شما (app/api/transactions و ...) حفظ شود.

import { cookies } from 'next/headers';
import { clientIdentityHeaders } from '@/lib/client-identity';

const API_BASE_URL = process.env.API_BASE_URL || process.env.NEST_API_URL || (process.env.NODE_ENV === 'production' ? 'https://api.arkan.gold' : 'http://localhost:5000');

export async function proxyToApi(
  path: string,
  init: RequestInit & { isFormData?: boolean } = {},
): Promise<Response> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('accessToken')?.value; // نام کوکی را با پروژه‌تان هماهنگ کنید

  const headers: Record<string, string> = {
    ...(init.isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...(await clientIdentityHeaders()),
  };

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });

  return res;
}
