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

const HIDDEN_PREFIXES = ["/invoice", "/courier", "/verifyInvoice"];
const AUTH_PREFIXES = ["/login", "/register", "/forgot-password"];

// ── سازگاری با ناحیه‌ی امن آیفون (PWA) ─────────────────────────────────────────
// در حالت تمام‌صفحه‌ی گفتینو روی موبایل، پنجره‌ی چت از top:0 شروع می‌شد و با نوار وضعیت
// شفاف (black-translucent) سرتیتر و دکمه‌ی بستن چت زیر ساعت/Dynamic Island می‌رفت. هر
// المان fixed تمام‌عرض گفتینو به اندازه‌ی safe-area از بالا (و پایین) جابه‌جا می‌شود؛ با
// بسته شدن چت (کوچک/پنهان شدن پنجره) مقادیر اصلی خود گفتینو برگردانده می‌شود.
const FIT_FLAG = "agSafeFit";
const FIT_PROPS = ["top", "height", "max-height"] as const;

function safeInsetTop(): number {
  const bar = document.querySelector<HTMLElement>(".pwa-status-bar");
  return bar ? bar.getBoundingClientRect().height : 0;
}

function goftinoFixedNodes(): HTMLElement[] {
  const found = new Set<HTMLElement>();
  document
    .querySelectorAll<HTMLElement>('[id^="goftino"]:not(script), iframe[src*="goftino"]')
    .forEach((el) => {
      // خود المان و والدهای fixed آن تا body (ساختار DOM گفتینو ممکن است عوض شود)
      for (let n: HTMLElement | null = el; n && n !== document.body; n = n.parentElement) {
        if (getComputedStyle(n).position === "fixed") found.add(n);
      }
    });
  return [...found];
}

function restore(el: HTMLElement) {
  if (el.dataset[FIT_FLAG] !== "1") return;
  const saved = JSON.parse(el.dataset[`${FIT_FLAG}Saved`] ?? "{}") as Record<
    string,
    [string, string]
  >;
  for (const prop of FIT_PROPS) {
    const [value, priority] = saved[prop] ?? ["", ""];
    if (value) el.style.setProperty(prop, value, priority);
    else el.style.removeProperty(prop);
  }
  delete el.dataset[FIT_FLAG];
  delete el.dataset[`${FIT_FLAG}Saved`];
}

function fitGoftinoToSafeArea() {
  const inset = safeInsetTop();
  for (const el of goftinoFixedNodes()) {
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const fullscreen =
      inset > 0 &&
      cs.display !== "none" &&
      cs.visibility !== "hidden" &&
      rect.width >= window.innerWidth * 0.95 &&
      rect.height >= window.innerHeight * 0.6;
    if (!fullscreen) {
      restore(el);
      continue;
    }
    // گفتینو ممکن است استایل را دوباره بنویسد (بدون important) → دوباره اعمال می‌شود
    if (el.dataset[FIT_FLAG] === "1" && el.style.getPropertyPriority("top") === "important")
      continue;
    if (el.dataset[FIT_FLAG] !== "1") {
      const saved: Record<string, [string, string]> = {};
      for (const prop of FIT_PROPS)
        saved[prop] = [el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)];
      el.dataset[`${FIT_FLAG}Saved`] = JSON.stringify(saved);
      el.dataset[FIT_FLAG] = "1";
    }
    const free = "100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom)";
    el.style.setProperty("top", "env(safe-area-inset-top)", "important");
    el.style.setProperty("height", `calc(${free})`, "important");
    el.style.setProperty("max-height", `calc(${free})`, "important");
  }
}

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
    // تنظیم پنجره‌ی چت با هر تغییر استایل/درج المان‌های گفتینو (در فریم بعدی، یک‌بار)
    let raf = 0;
    const scheduleFit = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        fitGoftinoToSafeArea();
        observeNodes();
      });
    };
    const nodeObserver = new MutationObserver(scheduleFit);
    const observed = new WeakSet<HTMLElement>();
    const observeNodes = () => {
      document
        .querySelectorAll<HTMLElement>('[id^="goftino"]:not(script), iframe[src*="goftino"]')
        .forEach((el) => {
          for (let n: HTMLElement | null = el; n && n !== document.body; n = n.parentElement) {
            if (observed.has(n)) continue;
            observed.add(n);
            nodeObserver.observe(n, { attributes: true, attributeFilter: ["style", "class"] });
          }
        });
    };
    // المان‌های گفتینو مستقیم به body اضافه می‌شوند
    const bodyObserver = new MutationObserver(scheduleFit);
    bodyObserver.observe(document.body, { childList: true });
    window.addEventListener("resize", scheduleFit);
    window.addEventListener("orientationchange", scheduleFit);
    scheduleFit();

    const onOpen = () => {
      setOpen(true);
      scheduleFit();
      // انیمیشن باز شدن گفتینو چند صد میلی‌ثانیه طول می‌کشد
      window.setTimeout(scheduleFit, 350);
      window.setTimeout(scheduleFit, 1000);
    };
    const onClose = () => {
      setOpen(false);
      scheduleFit();
      window.setTimeout(scheduleFit, 350);
    };
    window.addEventListener("goftino_ready", onReady);
    window.addEventListener("goftino_openWidget", onOpen);
    window.addEventListener("goftino_closeWidget", onClose);

    const cleanup = () => {
      window.clearInterval(poll);
      if (raf) window.cancelAnimationFrame(raf);
      nodeObserver.disconnect();
      bodyObserver.disconnect();
      window.removeEventListener("resize", scheduleFit);
      window.removeEventListener("orientationchange", scheduleFit);
      window.removeEventListener("goftino_ready", onReady);
      window.removeEventListener("goftino_openWidget", onOpen);
      window.removeEventListener("goftino_closeWidget", onClose);
    };

    // اسکریپت فقط یک‌بار درج می‌شود؛ شنونده‌ها در هر اجرای افکت دوباره ثبت می‌شوند
    if (document.getElementById("goftino-loader")) return cleanup;
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

    return cleanup;
  }, []);

  // تا آماده شدن API گفتینو دکمه‌ای نمایش داده نمی‌شود (آیکون خود گفتینو در دسترس است)
  if (!WIDGET_ID || !ready || HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  const inDashboard = pathname.startsWith("/dashboard");
  // صفحات ورود/ثبت‌نام تمام‌صفحه و بدون اسکرول‌اند؛ دکمه در گوشه‌ی بالا قرار می‌گیرد تا
  // روی لینک ثبت‌نام و متن قوانین پایین صفحه نیفتد (در دسکتاپ پایین صفحه جا دارد)
  const onAuthPage = AUTH_PREFIXES.some((p) => pathname.startsWith(p));

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
          : onAuthPage
            ? "top-[calc(0.75rem+env(safe-area-inset-top))] lg:top-auto lg:bottom-5"
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
