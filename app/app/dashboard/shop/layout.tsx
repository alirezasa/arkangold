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

  // سبد خرید بین زیورآلات و شمش مشترک است؛ کافی است یکی از دو خدمت فعال باشد
  if (pathname.startsWith("/dashboard/shop/cart")) {
    return (
      <ServiceGate service={["jewelry", "goldIngot"]}>{children}</ServiceGate>
    );
  }

  return <ServiceGate service="jewelry">{children}</ServiceGate>;
}
