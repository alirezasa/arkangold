// admin/app/(dashboard)/security/AuthSection.tsx
// بخش «احراز هویت و ورود» پنل امنیت (کلاس FIA) — شواهد قابل مشاهده‌ی هر الزام
"use client";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import axios from "axios";
import {
  AlertTriangle,
  BellRing,
  CalendarClock,
  CheckCircle2,
  Fingerprint,
  KeyRound,
  Loader2,
  Route,
  ShieldAlert,
  Smartphone,
  UserX,
} from "lucide-react";
import { useAdminMe } from "@/app/hooks/useAdminMe";
import { ActionButton, BAD, Badge, Card, OK, StatTile, Tech, WARN, fa, fetcher, getErrorMessage } from "./ui";

interface AuthStatus {
  passwordPolicy: {
    userMinLength: number;
    adminMinLength: number;
    maxLength: number;
    complexityRules: boolean;
    commonListSize: number;
    hibpEnabled: boolean;
    contextWordCount: number;
    periodicExpiry: boolean;
  };
  mfa: {
    totp: { algorithm: string; digits: number; stepSeconds: number; maxValiditySeconds: number };
    staff: { total: number; enrolled: number };
    agents: { total: number; enrolled: number };
    users: { total: number; totp: number };
    notEnrolled: { username: string; fullName: string; isAgent: boolean; lastLoginAt: string | null }[];
  };
  accounts: {
    reservedUsernames: { username: string; fullName: string }[];
    withoutPhone: { username: string; fullName: string }[];
    tempPasswords: { username: string; fullName: string; expiresAt: string | null; expired: boolean }[];
  };
  bruteForce: {
    freeAttempts: number;
    maxDelaySeconds: number;
    failedLogins24h: { users: number; admins: number };
    throttledAccounts7d: { users: number; admins: number };
    rateLimited24h: number;
    throttledIdentifiers: number;
    blockedIps: number;
  };
  alerts: { enabled: boolean; sent7d: number };
  expiry: {
    reminderDays: number[];
    apiKeyLifetimeDays: number;
    items: { kind: "partner_api_key" | "integration_credential"; label: string; expiresAt: string; daysLeft: number }[];
  };
  authPaths: { audience: string; name: string; steps: string[]; factors: string; endpoints: string[] }[];
}

const fmtDate = (iso: string) => new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(new Date(iso));
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 100);

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-gray-50 last:border-0 text-[12px]">
      <span className="text-gray-500">{label}</span>
      <span className="font-bold text-gray-800 text-left">{children}</span>
    </div>
  );
}

export default function AuthSection() {
  const { data, isLoading, error, mutate } = useSWR<AuthStatus>("/api/admin/security/auth-status", fetcher, {
    revalidateOnFocus: false,
  });
  const { me } = useAdminMe();
  const canManage = !!me?.permissions.includes("security.crypto.manage");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
      </div>
    );
  }
  if (error || !data) {
    return <p className="text-[13px] text-red-600 font-bold py-10 text-center">{getErrorMessage(error, "خطا در دریافت وضعیت")}</p>;
  }

  const p = data.passwordPolicy;
  const m = data.mfa;
  const panelTotal = m.staff.total + m.agents.total;
  const panelEnrolled = m.staff.enrolled + m.agents.enrolled;
  const soon = data.expiry.items.filter((i) => i.daysLeft <= Math.max(...data.expiry.reminderDays));

  const runReminders = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const { data: r } = await axios.post("/api/admin/security/expiry-reminders/run");
      setNotice({ ok: true, text: `${fa(r.checked)} اعتبارنامه بررسی شد؛ ${fa(r.reminded)} یادآوری ارسال شد` });
      await mutate();
    } catch (err) {
      setNotice({ ok: false, text: getErrorMessage(err, "ارسال یادآوری ناموفق بود") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {notice && (
        <div className={`p-3 rounded-xl text-[12px] font-bold ${notice.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
          {notice.text}
        </div>
      )}

      {/* ─── خلاصه ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="ورود دومرحله‌ای حساب‌های پنل"
          value={`${fa(panelEnrolled)} از ${fa(panelTotal)}`}
          tone={panelEnrolled === panelTotal ? "ok" : "warn"}
        />
        <StatTile
          label="ورود ناموفق ۲۴ ساعت اخیر"
          value={fa(data.bruteForce.failedLogins24h.users + data.bruteForce.failedLogins24h.admins)}
          tone={data.bruteForce.failedLogins24h.users + data.bruteForce.failedLogins24h.admins > 50 ? "warn" : "ok"}
        />
        <StatTile
          label="حساب‌های پیش‌فرض / قابل حدس"
          value={fa(data.accounts.reservedUsernames.length)}
          tone={data.accounts.reservedUsernames.length ? "bad" : "ok"}
        />
        <StatTile
          label="انقضای نزدیک (کلید/اعتبارنامه)"
          value={fa(soon.length)}
          tone={soon.some((s) => s.daysLeft <= 7) ? "bad" : soon.length ? "warn" : "ok"}
        />
      </div>

      {/* ─── سیاست رمز عبور ─── */}
      <Card
        icon={KeyRound}
        title="سیاست رمز عبور"
        subtitle="یکسان برای ثبت‌نام، تغییر و بازیابی رمز؛ قابل تنظیم در «تنظیمات سیستم ← امنیت ورود»"
      >
        <div className="grid md:grid-cols-2 gap-x-6">
          <div>
            <Row label="حداقل طول (کاربر / ادمین و نماینده)">
              {fa(p.userMinLength)} / {fa(p.adminMinLength)} کاراکتر
            </Row>
            <Row label="حداکثر طول">{fa(p.maxLength)} کاراکتر — بدون کوتاه‌سازی (پیش‌هش <Tech>SHA-384</Tech>)</Row>
            <Row label="قواعد ترکیب کاراکتر">
              <Badge {...OK}>ندارد — فقط طول و فهرست‌ها</Badge>
            </Row>
            <Row label="انقضای دوره‌ای اجباری">
              <Badge {...OK}>ندارد</Badge>
            </Row>
          </div>
          <div>
            <Row label="فهرست رمزهای رایج و افشاشده (آفلاین)">{fa(p.commonListSize)} رمز</Row>
            <Row label="استعلام Have I Been Pwned (k-anonymity)">
              {p.hibpEnabled ? <Badge {...OK}>فعال</Badge> : <Badge {...WARN}>غیرفعال</Badge>}
            </Row>
            <Row label="کلمات ممنوع مرتبط با برنامه">{fa(p.contextWordCount)} کلمه + نام/موبایل/نام کاربری خود حساب</Row>
            <Row label="ورودی رمز">نمایش/پنهان، چسباندن و مدیر رمز مجاز</Row>
          </div>
        </div>
      </Card>

      {/* ─── ورود دومرحله‌ای ─── */}
      <Card
        icon={Smartphone}
        title="ورود دومرحله‌ای"
        subtitle={
          <>
            کاربران: رمز + کد پیامکی یا برنامه‌ی احراز هویت — پنل: رمز/کد پیامکی + <Tech>TOTP</Tech> اجباری —{" "}
            {m.totp.algorithm}، {fa(m.totp.digits)} رقم، اعتبار حداکثر {fa(m.totp.maxValiditySeconds)} ثانیه
          </>
        }
      >
        <div className="grid sm:grid-cols-3 gap-3 mb-3">
          {[
            { label: "کارشناسان پنل", a: m.staff.enrolled, b: m.staff.total, required: true },
            { label: "نمایندگان", a: m.agents.enrolled, b: m.agents.total, required: true },
            { label: "کاربران با برنامه‌ی احراز هویت", a: m.users.totp, b: m.users.total, required: false },
          ].map((x) => (
            <div key={x.label} className="rounded-xl p-3" style={{ backgroundColor: "var(--color-bg-page)" }}>
              <p className="text-[11px] text-gray-500 mb-1">{x.label}</p>
              <p className="font-black text-[14px] text-gray-900">
                {fa(x.a)} از {fa(x.b)}{" "}
                <span className="text-[11px] font-bold text-gray-400">({fa(pct(x.a, x.b))}٪)</span>
              </p>
              <p className="text-[10px] text-gray-400 mt-1">
                {x.required ? "اجباری — در اولین ورود راه‌اندازی می‌شود" : "اختیاری — بقیه با رمز + کد پیامکی"}
              </p>
            </div>
          ))}
        </div>
        {m.notEnrolled.length > 0 && (
          <div className="text-[11px] text-amber-700 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              هنوز راه‌اندازی نکرده‌اند (در ورود بعدی اجباری می‌شود):{" "}
              {m.notEnrolled.map((a) => (
                <Tech key={a.username}>{a.username}</Tech>
              )).reduce<React.ReactNode[]>((acc, el, i) => (i ? [...acc, "، ", el] : [el]), [])}
            </span>
          </div>
        )}
      </Card>

      {/* ─── حساب‌ها ─── */}
      <Card icon={UserX} title="حساب‌های پیش‌فرض و رمزهای موقت" subtitle="رمز اولیه/بازنشانی را سیستم می‌سازد و فقط به موبایل صاحب حساب پیامک می‌کند (۲۴ ساعت، تغییر اجباری)">
        <div className="grid md:grid-cols-3 gap-3 text-[12px]">
          <div className="rounded-xl p-3" style={{ backgroundColor: "var(--color-bg-page)" }}>
            <p className="font-bold text-gray-700 mb-1">نام کاربری پیش‌فرض/قابل حدس</p>
            {data.accounts.reservedUsernames.length === 0 ? (
              <p className="text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> هیچ حسابی (admin، root، test …) وجود ندارد</p>
            ) : (
              data.accounts.reservedUsernames.map((a) => (
                <p key={a.username} className="text-red-600"><Tech>{a.username}</Tech> — {a.fullName}</p>
              ))
            )}
          </div>
          <div className="rounded-xl p-3" style={{ backgroundColor: "var(--color-bg-page)" }}>
            <p className="font-bold text-gray-700 mb-1">در انتظار تغییر رمز موقت</p>
            {data.accounts.tempPasswords.length === 0 ? (
              <p className="text-gray-400">موردی نیست</p>
            ) : (
              data.accounts.tempPasswords.map((a) => (
                <p key={a.username} className="flex items-center gap-1.5">
                  <Tech>{a.username}</Tech>
                  {a.expired ? <Badge {...BAD}>منقضی</Badge> : a.expiresAt ? <span className="text-gray-400">تا {fmtDate(a.expiresAt)}</span> : null}
                </p>
              ))
            )}
          </div>
          <div className="rounded-xl p-3" style={{ backgroundColor: "var(--color-bg-page)" }}>
            <p className="font-bold text-gray-700 mb-1">حساب پنل بدون موبایل</p>
            {data.accounts.withoutPhone.length === 0 ? (
              <p className="text-gray-400">موردی نیست</p>
            ) : (
              <>
                {data.accounts.withoutPhone.map((a) => (
                  <p key={a.username}><Tech>{a.username}</Tech></p>
                ))}
                <p className="text-[10px] text-amber-700 mt-1">بدون موبایل، رمز موقت و هشدار امنیتی ارسال نمی‌شود</p>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* ─── تلاش‌های مکرر و هشدارها ─── */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card icon={ShieldAlert} title="مقابله با حدس رمز و حملات خودکار" subtitle="شمارنده‌ها در Redis و مشترک بین همه‌ی نمونه‌های API">
          <Row label="سیاست">
            {fa(data.bruteForce.freeAttempts)} تلاش آزاد، سپس تأخیر فزاینده تا {fa(data.bruteForce.maxDelaySeconds / 60)} دقیقه
          </Row>
          <Row label="بررسی امنیتی خودکار (Proof-of-Work)">پس از ۳ شکست، ۱۰ شکست یک IP یا ابزار خودکار</Row>
          <Row label="ورود ناموفق ۲۴ ساعت (کاربر / پنل)">
            {fa(data.bruteForce.failedLogins24h.users)} / {fa(data.bruteForce.failedLogins24h.admins)}
          </Row>
          <Row label="حساب‌های واردشده به تأخیر (۷ روز)">
            {fa(data.bruteForce.throttledAccounts7d.users + data.bruteForce.throttledAccounts7d.admins)}
          </Row>
          <Row label="شناسه‌های در تأخیر / IPهای مسدود (هم‌اکنون)">
            {fa(data.bruteForce.throttledIdentifiers)} / {fa(data.bruteForce.blockedIps)}
          </Row>
          <Row label="رویداد محدودیت نرخ (۲۴ ساعت)">{fa(data.bruteForce.rateLimited24h)}</Row>
        </Card>
        <Card icon={BellRing} title="هشدار به صاحب حساب" subtitle="ورود از دستگاه جدید، تلاش‌های ناموفق مکرر و تغییرات امنیتی">
          <Row label="وضعیت">{data.alerts.enabled ? <Badge {...OK}>فعال</Badge> : <Badge {...WARN}>غیرفعال</Badge>}</Row>
          <Row label="کانال">پیامک به موبایل تأییدشده + اعلان درون‌برنامه</Row>
          <Row label="محتوا">زمان، دستگاه/مرورگر، IP ماسک‌شده</Row>
          <Row label="هشدارهای ارسال‌شده (۷ روز)">{fa(data.alerts.sent7d)}</Row>
          <p className="text-[11px] text-gray-400 mt-2">
            متن پیامک‌ها در{" "}
            <Link href="/sms" className="underline">مدیریت پیامک‌ها</Link> (دسته‌ی «هشدارهای امنیتی حساب») قابل ویرایش است.
          </p>
        </Card>
      </div>

      {/* ─── انقضا ─── */}
      <Card
        icon={CalendarClock}
        title="انقضای کلیدها و اعتبارنامه‌ها"
        subtitle={`یادآوری خودکار روزانه در ${data.expiry.reminderDays.map(fa).join("، ")} روز مانده — عمر کلید API شرکا ${fa(data.expiry.apiKeyLifetimeDays)} روز`}
        action={
          canManage ? (
            <ActionButton onClick={runReminders} loading={busy}>
              ارسال یادآوری‌ها
            </ActionButton>
          ) : undefined
        }
      >
        {data.expiry.items.length === 0 ? (
          <p className="text-[12px] text-gray-400 text-center py-4">اعتبارنامه‌ی دارای تاریخ انقضا ثبت نشده است</p>
        ) : (
          <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--color-border)" }}>
            <table className="w-full admin-table">
              <thead>
                <tr>
                  <th>اعتبارنامه</th>
                  <th>تاریخ انقضا</th>
                  <th>باقی‌مانده</th>
                </tr>
              </thead>
              <tbody>
                {data.expiry.items.map((i) => (
                  <tr key={`${i.kind}-${i.label}`}>
                    <td className="text-[12px]">{i.label}</td>
                    <td className="text-[12px]">{fmtDate(i.expiresAt)}</td>
                    <td>
                      {i.daysLeft < 0 ? (
                        <Badge {...BAD}>منقضی شده</Badge>
                      ) : i.daysLeft <= 7 ? (
                        <Badge {...BAD}>{fa(i.daysLeft)} روز</Badge>
                      ) : i.daysLeft <= 30 ? (
                        <Badge {...WARN}>{fa(i.daysLeft)} روز</Badge>
                      ) : (
                        <Badge {...OK}>{fa(i.daysLeft)} روز</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ─── مسیرهای احراز هویت ─── */}
      <Card icon={Route} title="فهرست مسیرهای احراز هویت" subtitle="همه‌ی مسیرهای صدور نشست؛ مسیر دیگری وجود ندارد (ورود تک‌عاملی پیامکی قدیمی حذف شده است)">
        <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--color-border)" }}>
          <table className="w-full admin-table">
            <thead>
              <tr>
                <th>مخاطب</th>
                <th>مسیر</th>
                <th>مراحل</th>
                <th>عامل‌ها</th>
              </tr>
            </thead>
            <tbody>
              {data.authPaths.map((a) => (
                <tr key={`${a.audience}-${a.name}`}>
                  <td className="text-[12px] whitespace-nowrap">{a.audience}</td>
                  <td className="text-[12px]">
                    <span className="font-bold">{a.name}</span>
                    {a.endpoints.map((e) => (
                      <bdi key={e} dir="ltr" className="block text-[10px] text-gray-400 font-mono">{e}</bdi>
                    ))}
                  </td>
                  <td className="text-[11px] text-gray-600">
                    <ol className="list-decimal pr-4 space-y-0.5">
                      {a.steps.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ol>
                  </td>
                  <td className="text-[11px]">{a.factors}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-gray-400 mt-2 flex items-center gap-1.5">
          <Fingerprint className="w-3.5 h-3.5" />
          بیومتریک در محصول استفاده نمی‌شود؛ ایمیل عامل احراز هویت نیست؛ راهنمای رمز و سؤال امنیتی وجود ندارد.
        </p>
      </Card>
    </div>
  );
}
