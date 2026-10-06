// admin/app/hooks/useLogout.ts
"use client";
import { useState } from "react";
import { mutate } from "swr";
import { logoutAndWipe } from "@/app/utils/session-cleanup";

/**
 * خروج از پنل: نشست سرور باطل، کوکی‌ها و همه‌ی داده‌های مرورگر (کش SWR، storage، Cache Storage)
 * پاک و صفحه‌ی ورود به‌صورت کامل بارگذاری می‌شود (FDP_RIP_EXT.1.1)
 */
export const useLogout = () => {
  const [loggingOut, setLoggingOut] = useState(false);

  const logout = async (everywhere = false) => {
    setLoggingOut(true);
    await mutate(() => true, undefined, { revalidate: false });
    await logoutAndWipe(
      everywhere ? "/api/admin-auth/logout-all" : "/api/admin-auth/logout",
    );
  };

  return { logout, loggingOut };
};
