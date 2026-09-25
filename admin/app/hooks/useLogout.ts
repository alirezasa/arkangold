// admin/app/hooks/useLogout.ts
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { mutate } from "swr";

/** خروج از پنل: نشست سرور باطل، کوکی‌ها پاک و کش SWR خالی می‌شود */
export const useLogout = () => {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const logout = async (everywhere = false) => {
    setLoggingOut(true);
    try {
      await axios.post(
        everywhere ? "/api/admin-auth/logout-all" : "/api/admin-auth/logout",
      );
    } catch {
      // حتی در صورت خطای شبکه، کاربر به صفحه ورود هدایت می‌شود
    } finally {
      await mutate(() => true, undefined, { revalidate: false });
      router.replace("/login");
      setLoggingOut(false);
    }
  };

  return { logout, loggingOut };
};
