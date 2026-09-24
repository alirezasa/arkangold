import type { ReactNode } from "react";
import ServiceGate from "../components/ServiceGate";

// نمایش صفحه فقط در صورت فعال بودن خدمت در پنل ادمین
export default function JewelryLayout({ children }: { children: ReactNode }) {
  return <ServiceGate service="jewelry">{children}</ServiceGate>;
}
