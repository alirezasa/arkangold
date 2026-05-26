import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthService } from "../core/services/auth.service";
import axios from "axios";

export const useLogin = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // استخراج پیام خطای استاندارد از بک‌اَند
  const handleError = (err: unknown) => {
    if (axios.isAxiosError(err)) {
      const message = err.response?.data?.message;
      setError(
        Array.isArray(message)
          ? message[0]
          : message || "خطایی در ارتباط با سرور رخ داد.",
      );
    } else {
      setError("خطای ناشناخته‌ای رخ داد.");
    }
  };

  // ۱. ورود با رمز عبور
  const loginWithPassword = async (phone: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      await AuthService.login(phone, password);
      router.replace("/dashboard");
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  // ۲. درخواست کد OTP برای ورود
  const sendLoginOtpCode = async (phone: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      await AuthService.sendLoginOtp(phone);
      return true; // موفق
    } catch (err) {
      handleError(err);
      return false; // ناموفق
    } finally {
      setLoading(false);
    }
  };

  // ۳. تایید کد OTP و ورود
  const verifyLoginOtpCode = async (phone: string, code: string) => {
    setLoading(true);
    setError(null);
    try {
      await AuthService.verifyLoginOtp(phone, code);
      router.replace("/dashboard");
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    setError,
    loginWithPassword,
    sendLoginOtpCode,
    verifyLoginOtpCode,
  };
};
