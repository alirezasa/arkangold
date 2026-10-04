// admin/app/login/LoginShell.tsx
// قاب مشترک صفحه‌ی ورود پنل مدیریت (admin.arkan.gold) و پنل نمایندگان (panel.arkan.gold)
import { ShieldCheck, Store } from "lucide-react";
import type { Portal } from "@/lib/portal";

const COPY: Record<
  Portal,
  { title: string; heading: string; description: string; footnote: string; formSubtitle: string }
> = {
  admin: {
    title: "پنل مدیریت",
    heading: "ورود به پنل",
    description:
      "مدیریت امن معاملات، کاربران و عملیات مالی پلتفرم — دسترسی مبتنی بر نقش برای هر کارشناس.",
    footnote: "دسترسی صرفاً برای کارشناسان مجاز — تمام فعالیت‌ها ثبت می‌شود",
    formSubtitle: "اطلاعات کاربری خود را وارد کنید",
  },
  agent: {
    title: "پنل نمایندگان",
    heading: "ورود نمایندگان",
    description:
      "موجودی امانی، ثبت فروش شمش برای مالک نهایی، تسویه و صورتحساب نمایندگی — همه در یک پنل.",
    footnote: "ورود فقط برای نمایندگان فروش ثبت‌شده — تمام فعالیت‌ها ثبت می‌شود",
    formSubtitle: "با شماره‌ی موبایل ثبت‌شده یا نام کاربری وارد شوید",
  },
};

export default function LoginShell({
  portal,
  children,
}: {
  portal: Portal;
  children: React.ReactNode;
}) {
  const c = COPY[portal];
  const Icon = portal === "agent" ? Store : ShieldCheck;

  return (
    <div
      className="min-h-screen flex flex-col lg:flex-row-reverse"
      dir="rtl"
      style={{ backgroundColor: "var(--color-bg-page)" }}
    >
      {/* ── پنل برندینگ (فقط دسکتاپ) ── */}
      <div
        className="hidden lg:flex lg:w-[45%] relative overflow-hidden flex-col justify-between p-16"
        style={{ backgroundColor: "var(--color-emerald)" }}
      >
        <div
          className="absolute -top-20 -left-20 w-72 h-72 rounded-full opacity-10 blur-3xl"
          style={{ background: "var(--color-gold-500)" }}
        />
        <div
          className="absolute -bottom-24 -right-24 w-72 h-72 rounded-full opacity-[0.06] blur-3xl"
          style={{ background: "var(--color-gold-500)" }}
        />

        <div className="relative z-10">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-8 shadow-2xl"
            style={{ backgroundColor: "var(--color-gold-500)" }}
          >
            <Icon className="w-8 h-8" style={{ color: "var(--color-emerald)" }} />
          </div>
          <h1 className="text-5xl font-black text-white leading-snug">
            {c.title}
            <br />
            <span style={{ color: "var(--color-gold-500)" }}>آرکان گلد</span>
          </h1>
          <p className="mt-8 text-xl text-white/60 font-light leading-relaxed max-w-sm">
            {c.description}
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-3 text-white/40 text-sm font-medium">
          <ShieldCheck className="w-5 h-5" style={{ color: "var(--color-gold-500)" }} />
          {c.footnote}
        </div>
      </div>

      {/* ── فرم ورود ── */}
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-16 py-12">
        <div className="w-full max-w-sm mx-auto">
          {/* لوگوی موبایل */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              <Icon className="w-6 h-6" style={{ color: "var(--color-gold-500)" }} />
            </div>
            <div>
              <h1 className="text-lg font-black text-gray-900">{c.title}</h1>
              <p className="text-[11px] text-gray-400">آرکان گلد</p>
            </div>
          </div>

          <div className="mb-8 hidden lg:block">
            <h2 className="text-2xl font-black text-gray-900 mb-1">{c.heading}</h2>
            <p className="text-gray-500 text-sm">{c.formSubtitle}</p>
          </div>

          {children}

          <p className="mt-10 text-center text-[11px] text-gray-400 leading-relaxed">
            {portal === "agent"
              ? "این پنل صرفاً برای نمایندگان فروش آرکان گلد است."
              : "این پنل صرفاً برای کارشناسان مجاز آرکان گلد است."}
            <br />
            تمامی ورودها و فعالیت‌ها ثبت و رصد می‌شود.
          </p>
        </div>
      </div>
    </div>
  );
}
