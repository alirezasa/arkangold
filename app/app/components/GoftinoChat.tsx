"use client";

// چت پشتیبانی گفتینو با دکمه‌ی شناور کوچک اختصاصی (به‌جای آیکون پیش‌فرض بزرگ گفتینو).
// شناسه‌ی ویجت آرکان گلد پیش‌فرض است (شناسه‌ی ویجت عمومی است و در کد صفحه دیده می‌شود)؛
// NEXT_PUBLIC_GOFTINO_WIDGET_ID آن را عوض و مقدار off آن را خاموش می‌کند. دامنه‌های گفتینو
// با همین قاعده در CSP مجازند (next.config.ts). در صفحات چاپ فاکتور و پیک نمایش داده نمی‌شود.
// اگر API جاوااسکریپت گفتینو پاسخ ندهد، آیکون خود گفتینو پنهان نمی‌شود تا چت همیشه در دسترس باشد.
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, X } from "lucide-react";

export const DEFAULT_GOFTINO_WIDGET_ID = "DvT1ia";
const configured = (process.env.NEXT_PUBLIC_GOFTINO_WIDGET_ID ?? "").trim();
const WIDGET_ID =
  configured.toLowerCase() === "off" ? "" : configured || DEFAULT_GOFTINO_WIDGET_ID;

interface GoftinoApi {
  setWidget: (opts: Record<string, unknown>) => void;
  toggle: () => void;
  open: () => void;
  close: () => void;
}

declare global {
  interface Window {
    Goftino?: GoftinoApi;
  }
}

const HIDDEN_PREFIXES = ["/invoice", "/courier"];

export default function GoftinoChat() {
  const pathname = usePathname() ?? "";
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!WIDGET_ID) return;
    let done = false;
    const onReady = () => {
      const api = window.Goftino;
      if (done || !api || typeof api.toggle !== "function") return;
      // آیکون پیش‌فرض گفتینو پنهان می‌شود؛ باز/بسته کردن فقط با دکمه‌ی خودمان
      try {
        api.setWidget({ hasIcon: false });
      } catch {
        return; // آیکون خود گفتینو می‌ماند
      }
      done = true;
      setReady(true);
    };
    // اگر رویداد آماده‌شدن با نام دیگری ارسال شود، وجود API چند ثانیه بررسی می‌شود
    let tries = 0;
    const poll = window.setInterval(() => {
      onReady();
      if (done || ++tries > 40) window.clearInterval(poll);
    }, 500);
    const onOpen = () => setOpen(true);
    const onClose = () => setOpen(false);
    window.addEventListener("goftino_ready", onReady);
    window.addEventListener("goftino_openWidget", onOpen);
    window.addEventListener("goftino_closeWidget", onClose);

    // اسکریپت فقط یک‌بار درج می‌شود؛ شنونده‌ها در هر اجرای افکت دوباره ثبت می‌شوند
    if (document.getElementById("goftino-loader")) {
      return () => {
        window.clearInterval(poll);
        window.removeEventListener("goftino_ready", onReady);
        window.removeEventListener("goftino_openWidget", onOpen);
        window.removeEventListener("goftino_closeWidget", onClose);
      };
    }
    const s = document.createElement("script");
    s.id = "goftino-loader";
    s.async = true;
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(`goftino_${WIDGET_ID}`);
    } catch {
      // دسترسی به localStorage ممکن نیست
    }
    const src = `https://www.goftino.com/widget/${encodeURIComponent(WIDGET_ID)}`;
    s.src = saved ? `${src}?o=${encodeURIComponent(saved)}` : src;
    document.head.appendChild(s);

    return () => {
      window.clearInterval(poll);
      window.removeEventListener("goftino_ready", onReady);
      window.removeEventListener("goftino_openWidget", onOpen);
      window.removeEventListener("goftino_closeWidget", onClose);
    };
  }, []);

  // تا آماده شدن API گفتینو دکمه‌ای نمایش داده نمی‌شود (آیکون خود گفتینو در دسترس است)
  if (!WIDGET_ID || !ready || HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  const inDashboard = pathname.startsWith("/dashboard");

  return (
    <button
      type="button"
      aria-label={open ? "بستن چت پشتیبانی" : "چت با پشتیبانی"}
      title="چت آنلاین با پشتیبانی"
      onClick={() => {
        try {
          window.Goftino?.toggle();
        } catch {
          window.Goftino?.open();
        }
      }}
      className={`group fixed left-4 z-9990 flex h-11 w-11 items-center justify-center rounded-full bg-emerald text-white shadow-lg shadow-emerald/30 ring-2 ring-white/80 transition-all hover:scale-105 hover:bg-[#085f48] focus:outline-none focus-visible:ring-4 focus-visible:ring-gold-500/60 ${
        inDashboard
          ? "bottom-[calc(5.5rem+env(safe-area-inset-bottom))] lg:bottom-5"
          : "bottom-[calc(1.25rem+env(safe-area-inset-bottom))]"
      }`}
    >
      {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      {!open && (
        <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-gold-500" />
      )}
    </button>
  );
}
