"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Search,
  Gem,
  ShoppingCart,
  PackageX,
  Scale,
  Receipt,
} from "lucide-react";
import {
  useCategories,
  useProducts,
  useCart,
  productImageUrl,
  ProductItem,
} from "@/app/hooks/useShop";

function fmtToman(v: string | number) {
  return Math.round(Number(v)).toLocaleString("fa-IR");
}

// محدوده قیمت هر محصول را بر اساس نوع قیمت‌گذاری محاسبه می‌کند
function getPriceRange(product: ProductItem): {
  min: number;
  max: number;
  isEstimate: boolean;
} {
  if (product.pricingMode === "WEIGHT_RANGE" && product.weightRange) {
    const pricePerGram = Number(product.weightRange.pricePerGramToman);
    const min = Number(product.weightRange.minWeightGrams) * pricePerGram;
    const max = Number(product.weightRange.maxWeightGrams) * pricePerGram;
    // این مقدار قبل از اعمال فرمول قیمت‌گذاری (اجرت/سود/مالیات) است، پس تخمینی است
    return { min, max, isEstimate: true };
  }

  const prices = product.variants.map((v) => Number(v.finalPriceToman));
  const base = Number(product.basePriceToman);
  const min = prices.length ? Math.min(...prices) : base;
  const max = prices.length ? Math.max(...prices) : base;
  return { min, max, isEstimate: false };
}

function ProductThumb({ product }: { product: ProductItem }) {
  const src = productImageUrl(product.primaryImageUrl);
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={product.name}
        className="w-full h-full object-cover"
        loading="lazy"
      />
    );
  }
  return (
    <div className="w-full h-full flex items-center justify-center text-rose-300">
      <Gem className="w-12 h-12" strokeWidth={1.2} />
    </div>
  );
}

export default function ShopPage() {
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const { categories } = useCategories();
  const { products, loading } = useProducts({
    categoryId,
    search,
    inStock: true,
  });
  const { cart } = useCart();

  const cartCount = cart?.items.reduce((s, i) => s + i.quantity, 0) ?? 0;

  return (
    <div
      className="w-full max-w-7xl mx-auto space-y-6 pb-24 animate-in fade-in duration-500"
      dir="rtl"
    >
      <div className="flex items-center gap-4 mb-2">
        <Link
          href="/dashboard"
          className="w-10 h-10 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors shadow-sm"
        >
          <ChevronRight className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-[20px] font-black text-gray-800">
            فروشگاه طلا و جواهر
          </h1>
          <p className="text-[12px] text-gray-500 mt-0.5">
            محصولات آماده تحویل با کیفیت تضمین‌شده
          </p>
        </div>
        <Link
          href="/dashboard/shop/orders"
          className="w-11 h-11 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors shadow-sm shrink-0"
          title="سفارش‌های من"
        >
          <Receipt className="w-5 h-5" />
        </Link>
        <Link
          href="/dashboard/shop/cart"
          className="relative w-11 h-11 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors shadow-sm shrink-0"
        >
          <ShoppingCart className="w-5 h-5" />
          {cartCount > 0 && (
            <span
              className="absolute -top-1.5 -left-1.5 min-w-4.5 h-4.5 px-1 rounded-full text-[10px] font-black text-white flex items-center justify-center"
              style={{ backgroundColor: "var(--color-red)" }}
            >
              {cartCount.toLocaleString("fa-IR")}
            </span>
          )}
        </Link>
      </div>

      <div className="relative">
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="جستجوی محصول..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setSearch(searchInput)}
          className="w-full bg-white border border-gray-200 rounded-xl py-3 pr-11 pl-4 text-[13px] font-bold text-gray-700 focus:ring-2 focus:ring-rose-200 outline-none shadow-sm"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        <button
          onClick={() => setCategoryId(undefined)}
          className={`shrink-0 px-4 py-2 rounded-xl text-[12px] font-bold whitespace-nowrap transition-all ${
            !categoryId
              ? "bg-rose-500 text-white shadow-md shadow-rose-500/20"
              : "bg-white text-gray-600 border border-gray-200"
          }`}
        >
          همه
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setCategoryId(cat.id)}
            className={`shrink-0 px-4 py-2 rounded-xl text-[12px] font-bold whitespace-nowrap transition-all ${
              categoryId === cat.id
                ? "bg-rose-500 text-white shadow-md shadow-rose-500/20"
                : "bg-white text-gray-600 border border-gray-200"
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-3xl p-4 border border-gray-100 animate-pulse h-64"
            />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <PackageX className="w-12 h-12 text-gray-300" />
          <p className="text-[13px] font-bold text-gray-400">محصولی یافت نشد</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map((product) => {
            const { min, max, isEstimate } = getPriceRange(product);
            const isWeightRange = product.pricingMode === "WEIGHT_RANGE";
            const inStock = isWeightRange
              ? true
              : product.variants.some((v) => v.inStock);

            return (
              <Link
                key={product.id}
                href={`/dashboard/shop/${product.slug}`}
                className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm hover:shadow-lg transition-all group"
              >
                <div className="relative aspect-square bg-gray-50 rounded-[20px] mb-4 overflow-hidden group-hover:scale-105 transition-transform">
                  <ProductThumb product={product} />
                  {isWeightRange && (
                    <span className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-white/90 text-gray-600 shadow-sm">
                      <Scale className="w-3 h-3" />
                      بازه‌وزنی
                    </span>
                  )}
                </div>

                <h3 className="text-[14px] font-bold text-gray-800 mb-1 line-clamp-1">
                  {product.name}
                </h3>
                <p className="text-[11px] text-gray-400 mb-3">
                  {product.category?.name ?? "—"}
                </p>

                <div className="flex items-center justify-between mt-auto">
                  <div className="text-[13px] font-black text-rose-600">
                    {isEstimate && "از "}
                    {min === max ? fmtToman(min) : `از ${fmtToman(min)}`}
                    <span className="text-[10px] mr-1 font-bold">تومان</span>
                  </div>
                  {!inStock && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">
                      ناموجود
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
