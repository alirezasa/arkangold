import axios from "axios";

// آدرس فرانت برای روت‌های معمولی NestJS
const NEST_API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/auth";

export const AuthService = {
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
  // ─── متدهای جدید (مربوط به ورود) که باید اضافه کنید ⬇️ ───

  login: async (phone: string, password: string) => {
    // درخواست به روت لاگین با رمز عبور
    const res = await axios.post(`${NEST_API_URL}/login`, { phone, password });
    return res.data;
  },

  loginWithOtp: async (phone: string, code: string) => {
    // درخواست به روت لاگین با کد یکبار مصرف
    const res = await axios.post(`${NEST_API_URL}/send-otp`, { phone, code });
    return res.data;
  },
};
