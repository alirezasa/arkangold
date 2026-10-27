// admin/app/components/NavMenu.tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { NAV_SECTIONS, canSeeNavItem, isNavActive } from "@/app/utils/nav";
import type { AdminMe } from "@/app/hooks/useAdminMe";

/**
 * منوی بخش‌بندی‌شده‌ی پنل (منوی کناری و کشویی): هر بخش جمع است و با کلیک روی عنوانش
 * زیربخش‌ها باز می‌شوند؛ در هر لحظه یک بخش باز است و بخشِ صفحه‌ی فعلی خودکار باز می‌شود.
 */
export default function NavMenu({ me, onNavigate }: { me: AdminMe; onNavigate?: () => void }) {
  const pathname = usePathname();

  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => canSeeNavItem(item, me)),
  })).filter((s) => s.items.length > 0);

  const activeTitle =
    sections.find((s) => !s.flat && s.items.some((i) => isNavActive(pathname, i.href)))?.title ?? null;

  const [openTitle, setOpenTitle] = useState<string | null>(activeTitle);
  // با رفتن به صفحه‌ای از بخش دیگر، همان بخش باز شود
  const [prevActive, setPrevActive] = useState(activeTitle);
  if (activeTitle !== prevActive) {
    setPrevActive(activeTitle);
    if (activeTitle) setOpenTitle(activeTitle);
  }

  const renderLink = (item: (typeof sections)[number]["items"][number], nested: boolean) => {
    const active = isNavActive(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-3 rounded-xl font-bold transition-colors ${
          nested ? "px-3 py-2 text-[12.5px]" : "px-3 py-2.5 text-[13px]"
        } ${active ? "" : "text-white! hover:bg-white/5 hover:text-white!"}`}
        style={active ? { backgroundColor: "var(--color-gold-500)", color: "var(--color-emerald)" } : undefined}
      >
        <item.icon className="w-4 h-4 shrink-0" />
        {item.label}
      </Link>
    );
  };

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
      {sections.map((section, idx) => {
        if (section.flat) {
          return (
            <div key={section.title} className="space-y-1 pb-2 mb-2 border-b border-white/10">
              {section.items.map((item) => renderLink(item, false))}
            </div>
          );
        }

        const open = openTitle === section.title;
        const hasActive = section.title === activeTitle;
        const panelId = `nav-section-${idx}`;
        return (
          <div key={section.title}>
            <button
              type="button"
              onClick={() => setOpenTitle(open ? null : section.title)}
              aria-expanded={open}
              aria-controls={panelId}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-black transition-colors text-white! hover:bg-white/5 ${
                open ? "bg-white/5" : ""
              }`}
            >
              <section.icon className="w-4 h-4 shrink-0" />
              <span className="flex-1 text-right">{section.title}</span>
              {hasActive && !open && (
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: "var(--color-gold-500)" }} />
              )}
              <ChevronDown
                className={`w-4 h-4 shrink-0 text-white/60! transition-transform duration-200 ${open ? "rotate-180" : ""}`}
              />
            </button>
            <div
              id={panelId}
              className={`grid transition-[grid-template-rows] duration-200 ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
            >
              <div className="overflow-hidden" inert={!open}>
                <div className="mt-1 mb-2 mr-5 pr-2 border-r border-white/15 space-y-1">
                  {section.items.map((item) => renderLink(item, true))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}
