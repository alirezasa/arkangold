"use client";

import Link from "next/link";
import { useAddToCart, useProducts, productImageUrl } from "@/app/hooks/useShop";
import { useState } from "react";
import {
  ChevronRight,
  Wallet,
  Info,
  ShieldCheck,
  Package,
  ShoppingCart,
  Loader2,
  CheckCircle2,
  PackageX,
} from "lucide-react";

const GOLD_INGOT_CATEGORY_SLUG = "gold-ingot";

function fmtToman(v: string | number) {
  return Math.round(Number(v)).toLocaleString("fa-IR");
}

export default function GoldIngotPage() {
  const { products, loading } = useProducts({
    categorySlug: GOLD_INGOT_CATEGORY_SLUG,
    inStock: false, // همه را نشان بده، وضعیت ناموجود را داخل کارت مشخص می‌کنیم
  });
  const { loading: addLoading, add } = useAddToCart();
  const [addedId, setAddedId] = useState<string | null>(null);

  // مرتب‌سازی بر اساس وزن (کم به زیاد) — چون هر شمش یک Product با دقیقاً یک Variant است
  const sortedProducts = [...products].sort((a, b) => {
    const wa = Number(a.variants[0]?.weightGrams ?? 0);
    const wb = Number(b.variants[0]?.weightGrams ?? 0);
    return wa - wb;
  });

  const handleAdd = async (variantId: string) => {
    const res = await add({ variantId, quantity: 1 });
    if (res) {
      setAddedId(variantId);
      setTimeout(() => setAddedId(null), 2000);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 pb-24 animate-in fade-in duration-500" dir="rtl">
      {/* ── هدر صفحه ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="w-10 h-10 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors shadow-sm shrink-0"
          >
            <ChevronRight className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-[20px] font-black text-gray-800">خرید شمش طلا</h1>
            <p className="text-[12px] text-gray-500 mt-1">شمش‌های ۲۴ عیار شرکتی با پلمپ امنیتی</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ── ستون اصلی: لیست محصولات ── */}
        <div className="lg:col-span-8">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-white border border-gray-100 rounded-3xl p-5 h-56 animate-pulse" />
              ))}
            </div>
          ) : sortedProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 bg-white rounded-3xl border border-gray-100">
              <PackageX className="w-12 h-12 text-gray-300" />
              <p className="text-[13px] font-bold text-gray-400">
                در حال حاضر شمشی برای فروش موجود نیست
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {sortedProducts.map((product) => {
                const variant = product.variants[0];
                if (!variant) return null;
                const justAdded = addedId === variant.id;

                return (
                  <div
                    key={product.id}
                    className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group"
                  >
                    <div className="absolute -right-6 -top-6 w-32 h-32 bg-linear-to-br from-yellow-100 to-yellow-50 rounded-full blur-2xl opacity-50 group-hover:opacity-80 transition-opacity" />

                    <div className="relative z-10">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-yellow-50 text-yellow-600 rounded-2xl flex items-center justify-center border border-yellow-100 overflow-hidden">
                            {product.primaryImageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={productImageUrl(product.primaryImageUrl) ?? undefined}
                                alt={product.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Package className="w-6 h-6" strokeWidth={1.5} />
                            )}
                          </div>
                          <div>
                            <h3 className="text-[15px] font-black text-gray-800">{product.name}</h3>
                            <div className="flex items-center gap-1.5 mt-1">
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                              <span className="text-[11px] font-bold text-gray-500">
                                {variant.weightGrams} گرم
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between mt-2">
                        <div>
                          <span className="block text-[11px] text-gray-400 mb-0.5">قیمت نهایی</span>
                          <div className="text-[18px] font-black text-gray-800">
                            {fmtToman(variant.finalPriceToman)}{" "}
                            <span className="text-[11px] font-bold text-gray-500">تومان</span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleAdd(variant.id)}
                          disabled={!variant.inStock || addLoading}
                          className="flex items-center gap-2 bg-green-900 hover:bg-green-800 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all active:scale-95 shadow-[0_4px_15px_rgba(234,179,8,0.25)]"
                        >
                          {addLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : justAdded ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : (
                            <ShoppingCart className="w-4 h-4" />
                          )}
                          {!variant.inStock ? "ناموجود" : justAdded ? "افزوده شد" : "خرید"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {sortedProducts.length > 0 && (
            <div className="mt-4 text-left">
              <Link
                href="/dashboard/shop/cart"
                className="inline-block text-[12px] font-bold"
                style={{ color: "var(--color-emerald)" }}
              >
                مشاهده سبد خرید ←
              </Link>
            </div>
          )}
        </div>

        {/* ── ستون کناری: راهنما ── */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-yellow-50/50 rounded-3xl p-5 border border-yellow-100/50">
            <div className="flex gap-3 text-yellow-800/80">
              <Info className="w-5 h-5 shrink-0 text-yellow-600" />
              <div className="text-[11px] leading-relaxed font-medium space-y-2.5">
                <p>• تمامی شمش‌ها دارای پلمپ امنیتی هولوگرام‌دار شرکتی و فاکتور رسمی می‌باشند.</p>
                <p>• قیمت هر شمش شامل ارزش طلای خالص به‌علاوه اجرت پلمپ و بسته‌بندی است.</p>
                <p>• پس از خرید، تحویل از طریق همان فرآیند سفارش فروشگاه (انتخاب آدرس و پرداخت) انجام می‌شود.</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-3 text-gray-800">
              <Wallet className="w-5 h-5 text-yellow-600" />
              <h3 className="text-[14px] font-black">پرداخت شمش‌ها</h3>
            </div>
            <p className="text-[12px] text-gray-500 leading-relaxed">
              بعد از افزودن به سبد، از صفحه سبد خرید می‌توانید از کیف پول یا درگاه پرداخت (در صورت فعال بودن) هزینه را پرداخت کنید.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}