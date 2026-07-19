"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";

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
      if (axios.isAxiosError(err)) {
        const msg = err.response?.data?.message;
        setError(Array.isArray(msg) ? msg[0] : msg || "خطا در ورود");
      } else {
        setError("خطای ناشناخته‌ای رخ داد");
      }
    } finally {
      setLoading(false);
    }
  };

  return { login, loading, error, setError };
};
