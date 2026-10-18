import axios from "axios";
import { logoutAndWipe } from "@/app/utils/session-cleanup";
import { installSensitiveQueryGuard } from "@/app/utils/sensitive-query";

/** رویداد سراسری قفل نشست پس از عدم فعالیت (پاسخ 401 با کد SESSION_LOCKED) */
export const SESSION_LOCKED_EVENT = "arkan-admin:session-locked";

export const adminApi = axios.create({
  baseURL: "/",
  headers: { "Content-Type": "application/json" },
});

installSensitiveQueryGuard(adminApi);

adminApi.interceptors.response.use(
  (res) => res,
  async (error) => {
    // قفل عدم فعالیت: نشست باقی است و فقط صفحه‌ی ورود رمز نمایش داده می‌شود (IdleLock)
    if (error.response?.status === 401 && error.response?.data?.code === "SESSION_LOCKED") {
      if (typeof window !== "undefined") window.dispatchEvent(new Event(SESSION_LOCKED_EVENT));
      return Promise.reject(error);
    }
    if (error.response?.status === 401) {
      // پایان نشست (انقضا/ابطال): پاک‌سازی کامل داده‌های نشست در مرورگر
      if (typeof window !== "undefined") {
        await logoutAndWipe("/api/admin-auth/logout");
      }
    }
    return Promise.reject(error);
  },
);
