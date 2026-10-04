// admin/app/hooks/useAdminAuth.ts
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";

interface NestApiError {
  message?: string | string[];
  statusCode?: number;
}

const getErrorMessage = (err: unknown, defaultMsg: string): string => {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const data = err.response?.data as NestApiError | undefined;
    const message = Array.isArray(data?.message) ? data?.message[0] : data?.message;

    if (status === 429) {
      // پیام فارسی سرویس (مثلاً «۴۵ ثانیه دیگر تلاش کنید») مقدم است بر پیام عمومی محدودیت نرخ
      return message && /[\u0600-\u06FF]/.test(message)
        ? message
        : "تعداد تلاش‌های ورود بیش از حد مجاز است. لطفاً چند دقیقه صبر کنید.";
    }
    // پیام قفل حساب و سایر پیام‌های AdminAuthService (مثلاً "۱۵ دقیقه دیگر تلاش کنید")
    if (message) return message;
  }
  return defaultMsg;
};

export const useAdminLogin = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const login = async (username: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      await axios.post("/api/admin-auth/login", { username, password });
      router.replace("/");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "خطا در ورود. لطفاً دوباره تلاش کنید."));
    } finally {
      setLoading(false);
    }
  };

  return { login, loading, error, setError };
};

/** ورود نماینده با کد یکبارمصرف (فقط شماره‌ای که مدیر روی حساب نماینده ثبت کرده) */
export const useAgentOtpLogin = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  /** در صورت موفقیت، فاصله‌ی مجاز ارسال مجدد (ثانیه) و پیام برمی‌گردد */
  const requestCode = async (
    phone: string,
  ): Promise<{ message: string; resendAfter: number; expiresIn: number } | null> => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await axios.post("/api/admin-auth/agent-otp/request", { phone });
      return {
        message: data.message as string,
        resendAfter: Number(data.resendAfter) || 60,
        expiresIn: Number(data.expiresIn) || 180,
      };
    } catch (err: unknown) {
      setError(getErrorMessage(err, "ارسال کد ممکن نشد. لطفاً دوباره تلاش کنید."));
      return null;
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async (phone: string, code: string) => {
    setLoading(true);
    setError(null);
    try {
      await axios.post("/api/admin-auth/agent-otp/verify", { phone, code });
      router.replace("/agent-portal");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "ورود ناموفق بود. لطفاً دوباره تلاش کنید."));
    } finally {
      setLoading(false);
    }
  };

  return { requestCode, verifyCode, loading, error, setError };
};
