"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import useSWR from "swr";
import axios from "axios";
import { Loader2, Package, Plus, Search, X } from "lucide-react";

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

interface ProductVariant {
  id: string;
  weightGrams: string;
  finalPriceToman: string;
  stockQuantity: number;
  inStock: boolean;
}

interface ProductItem {
  id: string;
  name: string;
  slug: string;
  basePriceToman: string;
  status: "ACTIVE" | "INACTIVE" | "OUT_OF_STOCK";
  pricingMode: "FIXED" | "WEIGHT_RANGE";
  category?: { name: string };
  variants: ProductVariant[];
}

interface ProductsResponse {
  data: ProductItem[];
  total: number;
  totalPages: number;
  page: number;
}

interface CategoryItem {
  id: string;
  name: string;
}

const STATUS_META: Record<
  string,
  { label: string; bg: string; color: string }
> = {
  ACTIVE: { label: "فعال", bg: "#dcfce7", color: "#16a34a" },
  INACTIVE: { label: "غیرفعال", bg: "#f3f4f6", color: "#6b7280" },
  OUT_OF_STOCK: { label: "ناموجود", bg: "#fef3c7", color: "#b45309" },
};

const STATUS_FILTERS = [
  { key: "", label: "همه" },
  { key: "ACTIVE", label: "فعال" },
  { key: "INACTIVE", label: "غیرفعال" },
  { key: "OUT_OF_STOCK", label: "ناموجود" },
];

export default function ProductsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [page, setPage] = useState(1);
const [search, setSearch] = useState("");
const [searchInput, setSearchInput] = useState("");
const [statusFilter, setStatusFilter] = useState("");
const [categoryFilter, setCategoryFilter] = useState(
  () => searchParams.get("categoryId") ?? ""
);


  // ── اگه از صفحه دسته‌بندی با ?categoryId=... اومده باشیم، فیلتر رو خودکار ست کن ──
  

  const { data: categories } = useSWR<CategoryItem[]>(
    "/api/admin/shop/categories",
    fetcher,
  );

  const qs = new URLSearchParams({ page: String(page), limit: "20" });
  if (search) qs.set("search", search);
  if (statusFilter) qs.set("status", statusFilter);
  if (categoryFilter) qs.set("categoryId", categoryFilter);

  const { data, isLoading } = useSWR<ProductsResponse>(
    `/api/admin/shop/products?${qs.toString()}`,
    fetcher,
  );

  const activeCategoryName = categories?.find(
    (c) => c.id === categoryFilter,
  )?.name;

  const clearCategoryFilter = () => {
    setCategoryFilter("");
    setPage(1);
    router.replace(pathname);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-black text-gray-900">محصولات فروشگاه</h1>
        <Link
          href="/shop/products/new"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-[13px] font-bold"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          <Plus className="w-4 h-4" /> محصول جدید
        </Link>
      </div>
      <p className="text-[12px] text-gray-400 mb-4">
        {data ? `${data.total.toLocaleString("fa-IR")} محصول` : "..."}
      </p>

      {activeCategoryName && (
        <div
          className="flex items-center justify-between mb-4 px-4 py-2.5 rounded-xl"
          style={{ backgroundColor: "var(--color-emerald-light)" }}
        >
          <span
            className="text-[12px] font-bold"
            style={{ color: "var(--color-emerald)" }}
          >
            فیلتر شده بر اساس دسته‌بندی: {activeCategoryName}
          </span>
          <button
            onClick={clearCategoryFilter}
            className="flex items-center gap-1 text-[11px] font-bold text-gray-500 hover:text-gray-700"
          >
            <X className="w-3.5 h-3.5" /> حذف فیلتر
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="جستجو در نام محصول..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" && (setSearch(searchInput), setPage(1))
            }
            className="w-full bg-white border border-gray-200 rounded-xl py-3 pr-11 pl-4 text-[13px] font-medium outline-none focus:border-gold-500"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setPage(1);
            if (!e.target.value) router.replace(pathname);
          }}
          className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-[13px] font-medium outline-none"
        >
          <option value="">همه دسته‌بندی‌ها</option>
          {categories?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 mb-4">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => {
              setStatusFilter(f.key);
              setPage(1);
            }}
            className="shrink-0 px-4 py-2 rounded-xl text-[12px] font-bold whitespace-nowrap"
            style={
              statusFilter === f.key
                ? { backgroundColor: "var(--color-emerald)", color: "#fff" }
                : {
                    backgroundColor: "var(--color-surface)",
                    color: "#6b7280",
                    border: "1px solid var(--color-border)",
                  }
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      <div
        className="rounded-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        <table className="w-full admin-table">
          <thead>
            <tr>
              <th>نام محصول</th>
              <th>دسته‌بندی</th>
              <th>نوع قیمت‌گذاری</th>
              <th>قیمت پایه</th>
              <th>تنوع‌ها</th>
              <th>وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="text-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-300" />
                </td>
              </tr>
            ) : !data?.data?.length ? (
              <tr>
                <td colSpan={6} className="text-center py-10">
                  <div className="flex flex-col items-center gap-2">
                    <Package className="w-8 h-8 text-gray-200" />
                    <p className="text-[12px] text-gray-400">محصولی یافت نشد</p>
                  </div>
                </td>
              </tr>
            ) : (
              data.data.map((p) => {
                const meta = STATUS_META[p.status] ?? STATUS_META.ACTIVE;
                return (
                  <tr key={p.id}>
                    <td>
                      <Link
                        href={`/shop/products/${p.id}`}
                        className="font-bold hover:underline"
                        style={{ color: "var(--color-emerald)" }}
                      >
                        {p.name}
                      </Link>
                    </td>
                    <td className="text-[12px] text-gray-500">
                      {p.category?.name ?? "—"}
                    </td>
                    <td className="text-[12px] text-gray-500">
                      {p.pricingMode === "WEIGHT_RANGE"
                        ? "بازه‌وزنی"
                        : "تنوع ثابت"}
                    </td>
                    <td className="font-bold">
                      {Number(p.basePriceToman).toLocaleString("fa-IR")} ت
                    </td>
                    <td className="text-[12px] text-gray-500">
                      {p.pricingMode === "WEIGHT_RANGE"
                        ? "—"
                        : `${p.variants.length.toLocaleString("fa-IR")} تنوع`}
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={{ background: meta.bg, color: meta.color }}
                      >
                        {meta.label}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-bold disabled:opacity-40"
          >
            قبلی
          </button>
          <span className="text-[12px] font-bold text-gray-500">
            صفحه {page.toLocaleString("fa-IR")} از{" "}
            {data.totalPages.toLocaleString("fa-IR")}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            disabled={page >= data.totalPages}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-bold disabled:opacity-40"
          >
            بعدی
          </button>
        </div>
      )}
    </div>
  );
}
