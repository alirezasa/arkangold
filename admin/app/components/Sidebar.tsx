// admin/app/components/Sidebar.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_SECTIONS } from "@/app/utils/nav";
import { ShieldCheck } from "lucide-react";

export default function Sidebar({ permissions }: { permissions: string[] }) {
  const pathname = usePathname();

  return (
    <aside
      className="hidden lg:flex lg:flex-col w-64 shrink-0 h-screen sticky top-0"
      style={{ backgroundColor: "var(--color-emerald)" }}
    >
      <div className="px-5 py-5 border-b border-white/10 flex items-center gap-2.5">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: "var(--color-gold-500)" }}
        >
          <ShieldCheck className="w-5 h-5" style={{ color: "var(--color-emerald)" }} />
        </div>
        <div>
          <h1 className="text-white font-black text-[15px] leading-tight">پنل مدیریت</h1>
          <p className="text-white/40 text-[10px]">آرکان گلد</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV_SECTIONS.map((section) => {
          const visibleItems = section.items.filter((item) => !item.perm || permissions.includes(item.perm));
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.title}>
              <p className="px-3 mb-1.5 text-[10px] font-bold text-white! uppercase tracking-wider">
                {section.title}
              </p>
              <div className="space-y-1">
                {visibleItems.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-bold transition-colors ${
                        active ? "" : "text-white! hover:bg-white/5 hover:text-white!"
                      }`}
                      style={active ? { backgroundColor: "var(--color-gold-500)", color: "var(--color-emerald)" } : undefined}
                    >
                      <item.icon className="w-4 h-4 shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}