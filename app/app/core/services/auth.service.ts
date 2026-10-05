import axios from "axios";

// آدرس فرانت برای روت‌های معمولی NestJS
const NEST_API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://api.arkan.gold/auth"
    : "http://localhost:5000/auth");

export interface LoginChallenge {
  mfaRequired: true;
  method: "SMS" | "TOTP";
  challengeToken: string;
  maskedPhone?: string;
  expiresIn?: number;
  resendAfter?: number;
}

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
  // ─── بخش دوم: ورود دومرحله‌ای (FIA_UAU_EXT.2.3)
  // ==========================================

  // مرحله‌ی اول: رمز عبور (از طریق BFF). پاسخ نشست نیست؛ توکن مرحله و روش عامل دوم است.
  login: async (phone: string, password: string, captcha?: string) => {
    const response = await axios.post<LoginChallenge>(`/api/auth/login`, {
      phone,
      password,
      captcha,
    });
    return response.data;
  },

  // مرحله‌ی دوم: کد پیامکی، کد برنامه‌ی احراز هویت یا کد بازیابی (BFF کوکی نشست را ست می‌کند)
  verifyLogin: async (challengeToken: string, code: string) => {
    const response = await axios.post(`/api/auth/login/verify`, { challengeToken, code });
    return response.data;
  },

  // ارسال دوباره‌ی کد پیامکی مرحله‌ی دوم
  resendLoginCode: async (challengeToken: string) => {
    const response = await axios.post(`${NEST_API_URL}/login/resend`, { challengeToken });
    return response.data as { expiresIn: number; resendAfter: number };
  },

  // ==========================================
  // ─── بخش سوم: متدهای فراموشی رمز عبور
  // ==========================================

  // درخواست پیامک بازیابی
  forgotPassword: async (phone: string) => {
    const response = await axios.post(`${NEST_API_URL}/forgot-password`, { phone });
    return response.data;
  },

  // تایید پیامک: توکن بازیابی، یا اگر ورود دومرحله‌ای با برنامه فعال است، توکن مرحله‌ی بعد
  verifyResetOtp: async (phone: string, code: string) => {
    const response = await axios.post<
      | { resetToken: string }
      | { mfaRequired: true; method: "TOTP"; challengeToken: string; message: string }
    >(`${NEST_API_URL}/verify-reset-otp`, { phone, code });
    return response.data;
  },

  // FIA_UID_EXT.1.3: کد برنامه‌ی احراز هویت یا کد بازیابی برای ادامه‌ی بازیابی رمز
  verifyResetMfa: async (challengeToken: string, code: string) => {
    const response = await axios.post<{ resetToken: string }>(
      `${NEST_API_URL}/reset-password/verify-mfa`,
      { challengeToken, code },
    );
    return response.data;
  },

  // تنظیم رمز عبور جدید
  resetPassword: async (resetToken: string, password: string) => {
    const response = await axios.post(`${NEST_API_URL}/reset-password`, { resetToken, password });
    return response.data;
  }
};