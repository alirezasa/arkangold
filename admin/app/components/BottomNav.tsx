// admin/app/components/BottomNav.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BOTTOM_NAV_ITEMS } from "@/app/utils/nav";

export default function BottomNav({ permissions }: { permissions: string[] }) {
  const pathname = usePathname();
  const items = BOTTOM_NAV_ITEMS.filter((item) => !item.perm || permissions.includes(item.perm));

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around px-2 py-2 pb-safe"
      style={{ backgroundColor: "var(--color-surface)", borderTop: "1px solid var(--color-border)" }}
    >
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl"
          >
            <item.icon
              className="w-5 h-5"
              style={{ color: active ? "var(--color-emerald)" : "#9ca3af" }}
            />
            <span
              className="text-[10px] font-bold"
              style={{ color: active ? "var(--color-emerald)" : "#9ca3af" }}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}