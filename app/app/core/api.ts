import axios from 'axios';
import { logoutAndWipe } from '../utils/session-cleanup';

// ساخت یک نمونه اختصاصی از اکسیوس
export const api = axios.create({
  baseURL: '/', // آدرس پایه درخواست‌ها
  headers: {
    'Content-Type': 'application/json',
  },
});

// رهگیر پاسخ‌ها (Response Interceptor)
api.interceptors.response.use(
  (response) => {
    // اگر درخواست موفق بود، دیتا را برگردان
    return response;
  },
  async (error) => {
    // اگر خطای ۴۰۱ (عدم دسترسی / توکن منقضی یا حذف شده) دریافت کردیم
    if (error.response && error.response.status === 401) {
      // پایان نشست (انقضا/ابطال): باطل‌کردن نشست، پاک‌سازی کامل داده‌های مرورگر و هدایت به ورود
      if (typeof window !== 'undefined') {
        await logoutAndWipe('/api/auth/logout');
      }
    }
    
    // ارور را پاس بده تا کامپوننت هم متوجه خطا بشود
    return Promise.reject(error);
  }
);