// admin/app/components/Sidebar.tsx
"use client";
import type { AdminMe } from "@/app/hooks/useAdminMe";
import UserMenuCard from "./UserMenuCard";
import NavMenu from "./NavMenu";

export default function Sidebar({ me }: { me: AdminMe }) {
  return (
    <aside
      className="hidden lg:flex lg:flex-col w-64 shrink-0 h-screen sticky top-0 print:hidden"
      style={{ backgroundColor: "var(--color-emerald)" }}
    >
      <div className="px-5 py-5 border-b border-white/10 flex items-center gap-2.5">
        {/* لوگوی پویا (تنظیمات سیستم ← لوگو، مهر و امضا) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo" alt="" className="w-10 h-10 shrink-0 object-contain" />
        <div>
          <h1 className="text-white font-black text-[15px] leading-tight">
            {me.agent ? "پنل نمایندگی" : "پنل مدیریت"}
          </h1>
          <p className="text-white/40 text-[10px]">آرکان گلد</p>
        </div>
      </div>

      <NavMenu me={me} />

      <UserMenuCard me={me} />
    </aside>
  );
}
