// admin/app/components/MobileDrawer.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_SECTIONS } from "@/app/utils/nav";
import { X } from "lucide-react";

export default function MobileDrawer({
  open,
  onClose,
  permissions,
}: {
  open: boolean;
  onClose: () => void;
  permissions: string[];
}) {
  const pathname = usePathname();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-100 lg:hidden" dir="rtl">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className="fixed top-0 right-0 h-full w-72 max-w-[85vw] overflow-y-auto"
        style={{ backgroundColor: "var(--color-emerald)" }}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
          <h2 className="text-white font-black text-[15px]">منو</h2>
          <button onClick={onClose} className="p-1.5 text-white/90!">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="px-3 py-4 space-y-5">
          {NAV_SECTIONS.map((section) => {
            const visibleItems = section.items.filter((item) => !item.perm || permissions.includes(item.perm));
            if (visibleItems.length === 0) return null;
            return (
              <div key={section.title}>
                <p className="px-3 mb-1.5 text-[10px] font-bold text-white/90! uppercase tracking-wider">
                  {section.title}
                </p>
                <div className="space-y-1">
                  {visibleItems.map((item) => {
                    const active = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onClose}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-bold ${
                          active ? "" : "text-white!"
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
      </div>
    </div>
  );
}