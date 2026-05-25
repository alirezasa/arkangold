import { useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { AuthService } from "../core/services/auth.service";

export const useLogin = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const getErrorMessage = (err: unknown, defaultMsg: string): string => {
    if (axios.isAxiosError(err)) {
      if (err.response?.status === 429)
        return "درخواست‌ها بیش از حد مجاز است. لطفاً کمی صبر کنید.";
      const msg = err.response?.data?.message;
      if (msg) return Array.isArray(msg) ? msg[0] : msg;
    }
    return defaultMsg;
  };

  // ورود با رمز عبور
  const loginWithPassword = async (phone: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      // این متد باید در AuthService شما درخواست را به روت BFF بفرستد (مثلا /api/auth/login)
      await AuthService.login(phone, password);
      router.replace("/dashboard");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "شماره موبایل یا رمز عبور اشتباه است."));
    } finally {
      setLoading(false);
    }
  };

  // ارسال کد یکبار مصرف برای لاگین
  const sendLoginOtp = async (phone: string) => {
    setLoading(true);
    setError(null);
    try {
      await AuthService.sendOtp(phone);
      return true; // موفقیت‌آمیز بود
    } catch (err: unknown) {
      setError(
        getErrorMessage(err, "خطا در ارسال کد. لطفاً دوباره تلاش کنید."),
      );
      return false;
    } finally {
      setLoading(false);
    }
  };

  // تایید کد یکبار مصرف و ورود
  const verifyLoginOtp = async (phone: string, otpCode: string) => {
    setLoading(true);
    setError(null);
    try {
      // متد بررسی کد و دریافت کوکی‌ها برای ورود با OTP
      await AuthService.loginWithOtp(phone, otpCode);
      router.replace("/dashboard");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "کد وارد شده نادرست یا منقضی است."));
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    setError,
    loginWithPassword,
    sendLoginOtp,
    verifyLoginOtp,
  };
};
