"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import ServiceGate from "../components/ServiceGate";

// فروشگاه زیورآلات فقط در صورت فعال بودن خدمت در پنل ادمین نمایش داده می‌شود؛
// سوابق سفارش‌ها (orders) همیشه در دسترس کاربر باقی می‌ماند.
export default function ShopLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname.startsWith("/dashboard/shop/orders")) {
    return <>{children}</>;
  }

  return <ServiceGate service="jewelry">{children}</ServiceGate>;
}
