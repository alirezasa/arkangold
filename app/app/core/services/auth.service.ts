import axios from "axios";

// آدرس فرانت برای روت‌های معمولی NestJS
const NEST_API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/auth";

export const AuthService = {
  // ==========================================
  // ─── بخش اول: متدهای ثبت نام (کدهای قبلی شما)
  // ==========================================

  // مرحله ۱: ارسال شماره همراه
  sendOtp: async (phone: string) => {
    const response = await axios.post(`${NEST_API_URL}/send-otp`, { phone });
    return response.data;
  },

  // مرحله ۲: تایید کد OTP و دریافت کلاینتیِ TempToken
  verifyOtp: async (
    phone: string,
    code: string,
    type: "REAL" | "LEGAL",
    companyNationalId?: string,
  ) => {
    const response = await axios.post(`${NEST_API_URL}/verify-otp`, {
      phone,
      code,
      type,
      companyNationalId: type === "LEGAL" ? companyNationalId : undefined,
    });
    return response.data;
  },

  // مرحله ۳: ثبت نهایی رمز عبور از طریق لایه امن BFF خود نکس‌جی‌اس
  finalizeRegister: async (
    tempToken: string,
    password: string,
    referralCode?: string,
  ) => {
    const response = await axios.post("/api/auth/register", {
      tempToken,
      password,
      referralCode: referralCode || undefined,
    });
    return response.data;
  },

  // ==========================================
  // ─── بخش دوم: متدهای ورود (اضافه شده برای رفع خطا)
  // ==========================================

  // ارسال کد پیامکی ورود (درخواست مستقیم به NestJS چون کوکی نیاز ندارد)
  sendLoginOtp: async (phone: string) => {
    const response = await axios.post(`${NEST_API_URL}/send-login-otp`, { phone });
    return response.data;
  },

  // تایید کد ورود پیامکی (ارسال به BFF نکس‌جی‌اس برای ست کردن کوکی)
  verifyLoginOtp: async (phone: string, code: string) => {
    // آدرس باید مستقیماً به API داخلی خود نکس‌جی‌اس بخورد نه NEST_API_URL
    const response = await axios.post(`/api/auth/verify-login-otp`, { phone, code });
    return response.data;
  },

  // ورود با رمز عبور (ارسال به BFF نکس‌جی‌اس برای ست کردن کوکی)
  login: async (phone: string, password: string) => {
    // برای این هم بهتر است آدرس صریح نوشته شود
    const response = await axios.post(`/api/auth/login`, { phone, password });
    return response.data;
  },
  // ==========================================
  // ─── بخش سوم: متدهای فراموشی رمز عبور
  // ==========================================

  // درخواست پیامک بازیابی
  forgotPassword: async (phone: string) => {
    const response = await axios.post(`${NEST_API_URL}/forgot-password`, { phone });
    return response.data;
  },

  // تایید پیامک و دریافت توکن بازیابی (resetToken)
  verifyResetOtp: async (phone: string, code: string) => {
    const response = await axios.post(`${NEST_API_URL}/verify-reset-otp`, { phone, code });
    return response.data;
  },

  // تنظیم رمز عبور جدید
  resetPassword: async (resetToken: string, password: string) => {
    const response = await axios.post(`${NEST_API_URL}/reset-password`, { resetToken, password });
    return response.data;
  }
};