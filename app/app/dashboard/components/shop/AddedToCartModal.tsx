"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ShoppingCart, X } from "lucide-react";

/**
 * مودال پس از افزودن کالا به سبد — کاربر انتخاب می‌کند خرید را ادامه دهد
 * یا به سبد خرید برود.
 */
export default function AddedToCartModal({
  open,
  productName,
  onClose,
}: {
  open: boolean;
  productName?: string | null;
  onClose: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-200 flex items-end sm:items-center justify-center p-0 sm:p-4"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="added-to-cart-title"
      onClick={onClose}
    >
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />

      <div
        className="relative w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl shadow-2xl p-6 pb-[max(env(safe-area-inset-bottom),24px)] sm:pb-6 text-center"
        style={{ backgroundColor: "var(--color-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="بستن"
          className="absolute top-3 left-3 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
        </div>
        <h2
          id="added-to-cart-title"
          className="text-[16px] font-black text-gray-900 mb-1.5"
        >
          به سبد خرید افزوده شد
        </h2>
        {productName && (
          <p className="text-[12px] text-gray-500 mb-6">{productName}</p>
        )}

        <div className="flex flex-col gap-2.5 mt-2">
          <button
            onClick={() => router.push("/dashboard/shop/cart")}
            className="w-full py-3.5 rounded-xl text-[14px] font-black text-white flex items-center justify-center gap-2 shadow-lg"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            <ShoppingCart className="w-5 h-5" />
            رفتن به سبد خرید
          </button>
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl text-[13px] font-bold border-2 border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            ادامه خرید
          </button>
        </div>
      </div>
    </div>
  );
}
