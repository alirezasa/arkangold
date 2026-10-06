import axios from "axios";
import { logoutAndWipe } from "@/app/utils/session-cleanup";
import { installSensitiveQueryGuard } from "@/app/utils/sensitive-query";

export const adminApi = axios.create({
  baseURL: "/",
  headers: { "Content-Type": "application/json" },
});

installSensitiveQueryGuard(adminApi);

adminApi.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      // پایان نشست (انقضا/ابطال): پاک‌سازی کامل داده‌های نشست در مرورگر
      if (typeof window !== "undefined") {
        await logoutAndWipe("/api/admin-auth/logout");
      }
    }
    return Promise.reject(error);
  },
);
