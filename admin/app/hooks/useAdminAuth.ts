// admin/app/hooks/useAdminAuth.ts
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";

interface NestApiError {
  message?: string | string[];
  statusCode?: number;
}

export const useAdminLogin = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const getErrorMessage = (err: unknown, defaultMsg: string): string => {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const data = err.response?.data as NestApiError | undefined;

      if (status === 429) {
        return "تعداد تلاش‌های ورود بیش از حد مجاز است. لطفاً چند دقیقه صبر کنید.";
      }
      if (status === 403 && data?.message) {
        // پیام قفل حساب از AdminAuthService (مثلاً "۱۵ دقیقه دیگر تلاش کنید")
        return Array.isArray(data.message) ? data.message[0] : data.message;
      }
      if (data?.message) {
        return Array.isArray(data.message) ? data.message[0] : data.message;
      }
    }
    return defaultMsg;
  };

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
