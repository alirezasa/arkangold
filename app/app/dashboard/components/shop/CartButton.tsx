"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/app/hooks/useShop";

/** دکمه‌ی سبد خرید با شمارنده‌ی تعداد اقلام — برای هدر صفحات خرید */
export default function CartButton() {
  const { cart } = useCart();
  const count = cart?.items.reduce((s, i) => s + i.quantity, 0) ?? 0;

  return (
    <Link
      href="/dashboard/shop/cart"
      className="relative flex items-center gap-2 h-10 px-4 bg-white border border-gray-200 rounded-xl text-[13px] font-bold text-gray-700 hover:bg-gray-50 transition-colors shadow-sm shrink-0"
    >
      <ShoppingCart className="w-4.5 h-4.5" style={{ color: "var(--color-emerald)" }} />
      سبد خرید
      {count > 0 && (
        <span
          className="min-w-5 h-5 px-1.5 rounded-full text-[11px] font-black text-white flex items-center justify-center"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          {count.toLocaleString("fa-IR")}
        </span>
      )}
    </Link>
  );
}
