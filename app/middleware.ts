import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // ۱. خواندن کوکی امن اکسس توکن که در مرحله ثبت‌نام/ورود ست کردیم
  const token = request.cookies.get('accessToken')?.value;
  const { pathname } = request.nextUrl;

  // ۲. مدیریت صفحه اصلی (/)
  if (pathname === '/') {
    if (token) {
      // اگر لاگین بود، برود به داشبورد
      return NextResponse.redirect(new URL('/dashboard', request.url));
    } else {
      // اگر لاگین نبود، برود به لاگین
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  // ۳. حفاظت از صفحه داشبورد و تمام زیرمسیرهای آن
  if (pathname.startsWith('/dashboard')) {
    if (!token) {
      // کاربر لاگین نکرده ولی می‌خواهد وارد داشبورد شود -> هدایت به لاگین
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  // ۴. بهبود تجربه کاربری (UX): اگر کاربر لاگین هست، دیگر نباید بتواند به صفحه لاگین یا ثبت‌نام برود
  if (token && (pathname.startsWith('/login') || pathname.startsWith('/register'))) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // اجازه عبور به بقیه مسیرها (مثل فایل‌های استاتیک، تصاویر و APIها)
  return NextResponse.next();
}

// ۵. تعیین مسیرهایی که این میدلور باید روی آن‌ها نظارت کند
export const config = {
  matcher: [
    '/',                  // صفحه اصلی
    '/dashboard/:path*',  // داشبورد و تمام صفحات داخل آن
    '/login',             // صفحه ورود
    '/register',
    '/dashboard/identity'           // صفحه ثبت نام
  ],
};