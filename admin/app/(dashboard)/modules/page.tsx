// admin/app/(dashboard)/modules/page.tsx
// دسترسی سریع: همه‌ی ماژول‌های پنل به‌صورت کاشی‌های آیکون‌دار، دسته‌بندی‌شده و فقط در محدوده‌ی
// دسترسی ادمین فعلی (همان قواعد منوی کناری).
"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { LayoutGrid, Search } from "lucide-react";
import { useAdminMe } from "@/app/hooks/useAdminMe";
import { NAV_SECTIONS, canSeeNavItem } from "@/app/utils/nav";

const SKIP_HREFS = new Set(["/", "/modules"]);

export default function ModulesPage() {
  const { me } = useAdminMe();
  const [q, setQ] = useState("");

  const sections = useMemo(() => {
    if (!me) return [];
    const term = q.trim();
    return NAV_SECTIONS.map((section) => ({
      title: section.title,
      icon: section.icon,
      items: section.items.filter(
        (item) =>
          !SKIP_HREFS.has(item.href) &&
          canSeeNavItem(item, me) &&
          (!term || item.label.includes(term) || section.title.includes(term)),
      ),
    })).filter((s) => s.items.length > 0);
  }, [me, q]);

  return (
    <div dir="rtl">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-black text-gray-900">
            <LayoutGrid className="h-5 w-5 text-gray-400" />
            دسترسی سریع
          </h1>
          <p className="mt-1 text-[12px] text-gray-400">
            همه‌ی بخش‌های پنل که به آن‌ها دسترسی دارید، دسته‌بندی‌شده
          </p>
        </div>
        <label className="relative block w-full sm:w-72">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجوی بخش…"
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-3 pr-9 text-[13px] outline-none focus:border-gold-500"
          />
        </label>
      </div>

      {sections.length === 0 ? (
        <p className="py-16 text-center text-[13px] text-gray-400">بخشی یافت نشد</p>
      ) : (
        <div className="space-y-6">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="mb-2.5 flex items-center gap-1.5 text-[12.5px] font-black text-gray-600">
                <section.icon className="h-4 w-4 text-gray-400" />
                {section.title}
              </h2>
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
                {section.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group flex flex-col items-center gap-2 rounded-2xl border border-gray-100 bg-white px-2 py-4 text-center transition-all hover:-translate-y-0.5 hover:border-gold-500/40 hover:shadow-md focus-visible:border-gold-500"
                  >
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-50 transition-colors group-hover:bg-emerald">
                      <item.icon className="h-5 w-5 text-emerald transition-colors group-hover:text-white" />
                    </span>
                    <span className="text-[11.5px] font-bold leading-snug text-gray-700">
                      {item.label}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
