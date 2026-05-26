import axios from 'axios';

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
      try {
        // ۱. کوکی را از طریق BFF پاک کن
        await axios.post('/api/auth/logout');
        
        // ۲. کاربر را به صفحه لاگین هدایت کن
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
      } catch (logoutError) {
        console.error('خطا در خروج خودکار', logoutError);
      }
    }
    
    // ارور را پاس بده تا کامپوننت هم متوجه خطا بشود
    return Promise.reject(error);
  }
);