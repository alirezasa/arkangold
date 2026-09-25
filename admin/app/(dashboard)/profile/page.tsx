// admin/app/(dashboard)/profile/page.tsx
"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import axios from "axios";
import {
  Loader2,
  User,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Clock,
  LogOut,
  MonitorSmartphone,
  History,
  KeyRound,
  Save,
  Smartphone,
  Monitor,
  XCircle,
  Store,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { useAdminMe } from "@/app/hooks/useAdminMe";
import { useLogout } from "@/app/hooks/useLogout";

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

function getErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string | string[] } | undefined;
    if (data?.message) return Array.isArray(data.message) ? data.message[0] : data.message;
  }
  return fallback;
}

const faDateTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("fa-IR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const inputCls =
  "w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-gold-500 text-sm";

const cardStyle = {
  backgroundColor: "var(--color-surface)",
  border: "1px solid var(--color-border)",
};

type Tab = "info" | "security" | "sessions" | "activity" | "permissions";

const TABS: { key: Tab; label: string; icon: typeof User }[] = [
  { key: "info", label: "اطلاعات حساب", icon: User },
  { key: "security", label: "رمز عبور", icon: Lock },
  { key: "sessions", label: "نشست‌های فعال", icon: MonitorSmartphone },
  { key: "activity", label: "فعالیت‌های من", icon: History },
  { key: "permissions", label: "دسترسی‌ها", icon: KeyRound },
];

export default function ProfilePage() {
  const { me, loading } = useAdminMe();
  const { logout, loggingOut } = useLogout();
  const [tab, setTab] = useState<Tab>("info");

  if (loading || !me) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-black text-gray-900 mb-1">پروفایل کاربری</h1>
          <p className="text-[12px] text-gray-400">مدیریت حساب، امنیت ورود و نشست‌ها</p>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          disabled={loggingOut}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-black text-red-600 bg-red-50 border border-red-100 disabled:opacity-60"
        >
          {loggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
          خروج از پنل
        </button>
      </div>

      {/* ── کارت هویت ── */}
      <div className="rounded-2xl p-5 flex items-center gap-4 flex-wrap" style={cardStyle}>
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 text-[22px] font-black"
          style={{ backgroundColor: "var(--color-gold-500)", color: "var(--color-emerald)" }}
        >
          {me.fullName?.charAt(0) ?? "؟"}
        </div>
        <div className="flex-1 min-w-[200px]">
          <p className="text-[16px] font-black text-gray-900">{me.fullName}</p>
          <p dir="ltr" className="text-[12px] text-gray-400 text-right">
            @{me.username}
          </p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="badge" style={{ background: "var(--color-emerald-light)", color: "var(--color-emerald)" }}>
              {me.role.name}
            </span>
            {me.agent && (
              <span className="badge bg-amber-50 text-amber-700">
                <Store className="w-3 h-3" /> {me.agent.name} ({me.agent.code})
              </span>
            )}
            {me.totpEnabled ? (
              <span className="badge bg-green-50 text-green-700">
                <ShieldCheck className="w-3 h-3" /> ورود دومرحله‌ای فعال
              </span>
            ) : (
              <span className="badge bg-gray-100 text-gray-500">
                <AlertCircle className="w-3 h-3" /> ورود دومرحله‌ای غیرفعال
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] text-gray-500">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> آخرین ورود:
          </span>
          <span className="font-bold text-gray-700">{faDateTime(me.lastLoginAt)}</span>
          <span>IP آخرین ورود:</span>
          <span className="font-bold text-gray-700" dir="ltr">
            {me.lastLoginIp ?? "—"}
          </span>
          <span>نشست‌های فعال:</span>
          <span className="font-bold text-gray-700">{me.activeSessions.toLocaleString("fa-IR")}</span>
          <span>عضویت از:</span>
          <span className="font-bold text-gray-700">{faDateTime(me.createdAt)}</span>
        </div>
      </div>

      {/* ── تب‌ها ── */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold whitespace-nowrap border ${
              tab === t.key ? "text-white border-transparent" : "bg-white text-gray-600 border-gray-200"
            }`}
            style={tab === t.key ? { backgroundColor: "var(--color-emerald)" } : undefined}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "info" && <InfoTab />}
      {tab === "security" && <SecurityTab />}
      {tab === "sessions" && <SessionsTab />}
      {tab === "activity" && <ActivityTab />}
      {tab === "permissions" && <PermissionsTab />}
    </div>
  );
}

// ═══════════════════════════ اطلاعات حساب ═══════════════════════════

function InfoTab() {
  const { me, mutate } = useAdminMe();
  const [fullName, setFullName] = useState(me?.fullName ?? "");
  const [phone, setPhone] = useState(me?.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!me) return null;
  const dirty = fullName.trim() !== me.fullName || (phone || "") !== (me.phone || "");

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (fullName.trim().length < 3) return setError("نام و نام خانوادگی حداقل ۳ کاراکتر است");
    if (phone && !/^09\d{9}$/.test(phone)) return setError("شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود");
    setSaving(true);
    try {
      await axios.patch("/api/admin-auth/me", { fullName: fullName.trim(), phone });
      await mutate();
      setSaved(true);
    } catch (err) {
      setError(getErrorMessage(err, "خطا در ذخیره اطلاعات"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="rounded-2xl p-6 space-y-4 max-w-xl" style={cardStyle}>
      <h2 className="text-[14px] font-black text-gray-800">اطلاعات حساب کاربری</h2>
      {error && <Alert kind="error" text={error} />}
      {saved && <Alert kind="success" text="اطلاعات پروفایل ذخیره شد" />}

      <label className="block space-y-1.5">
        <span className="text-[12px] font-bold text-gray-500">نام کاربری (غیرقابل تغییر)</span>
        <input value={me.username} disabled dir="ltr" className={`${inputCls} bg-gray-50 text-gray-400 text-left`} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-[12px] font-bold text-gray-500">نام و نام خانوادگی</span>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} maxLength={80} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-[12px] font-bold text-gray-500">شماره موبایل (برای اعلان‌های پیامکی)</span>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, "").slice(0, 11))}
          placeholder="09xxxxxxxxx"
          dir="ltr"
          className={`${inputCls} text-left`}
        />
      </label>
      <div className="grid grid-cols-2 gap-3 text-[12px]">
        <div className="rounded-xl bg-gray-50 p-3">
          <p className="text-gray-400 mb-1">نقش</p>
          <p className="font-black text-gray-700">{me.role.name}</p>
        </div>
        <div className="rounded-xl bg-gray-50 p-3">
          <p className="text-gray-400 mb-1">ایجادشده توسط</p>
          <p className="font-black text-gray-700">{me.createdBy ?? "—"}</p>
        </div>
      </div>
      <button
        type="submit"
        disabled={saving || !dirty}
        className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-black text-white disabled:opacity-50"
        style={{ backgroundColor: "var(--color-emerald)" }}
      >
        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-4 h-4" />}
        ذخیره تغییرات
      </button>
    </form>
  );
}

// ═══════════════════════════ رمز عبور ═══════════════════════════

function passwordStrength(pw: string) {
  let score = 0;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ["خیلی ضعیف", "ضعیف", "متوسط", "خوب", "قوی", "خیلی قوی"];
  const colors = ["#dc2626", "#dc2626", "#d97706", "#ca8a04", "#16a34a", "#15803d"];
  return { score, label: labels[score], color: colors[score] };
}

function SecurityTab() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const strength = passwordStrength(newPassword);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!currentPassword) return setError("رمز عبور فعلی را وارد کنید");
    if (newPassword.length < 12) return setError("رمز عبور جدید باید حداقل ۱۲ کاراکتر باشد");
    if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword))
      return setError("رمز عبور جدید باید ترکیبی از حروف انگلیسی و عدد باشد");
    if (newPassword === currentPassword) return setError("رمز عبور جدید نباید با رمز فعلی یکسان باشد");
    if (newPassword !== confirmPassword) return setError("رمز عبور جدید و تکرار آن یکسان نیستند");

    setLoading(true);
    try {
      await axios.post("/api/admin-auth/change-password", { currentPassword, newPassword });
      setSuccess(true);
      setTimeout(() => router.replace("/login"), 2000);
    } catch (err) {
      setError(getErrorMessage(err, "خطا در تغییر رمز عبور"));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="rounded-2xl p-10 text-center max-w-xl" style={cardStyle}>
        <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto mb-3" />
        <h2 className="text-[15px] font-black text-gray-900 mb-1">رمز عبور تغییر یافت</h2>
        <p className="text-[12px] text-gray-500">در حال انتقال به صفحه ورود...</p>
      </div>
    );
  }

  const field = (
    label: string,
    value: string,
    set: (v: string) => void,
    auto: string,
    withToggle = false,
  ) => (
    <label className="block space-y-1.5">
      <span className="text-[12px] font-bold text-gray-500">{label}</span>
      <div className="relative flex items-center">
        <Lock className="absolute right-3 w-4 h-4 text-gray-400" />
        <input
          type={show ? "text" : "password"}
          dir="ltr"
          value={value}
          onChange={(e) => {
            set(e.target.value);
            if (error) setError(null);
          }}
          className={`${inputCls} pr-10 pl-10 text-left`}
          autoComplete={auto}
        />
        {withToggle && (
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="absolute left-3 text-gray-400 hover:text-gray-600"
            tabIndex={-1}
            aria-label="نمایش رمز"
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
    </label>
  );

  return (
    <form onSubmit={submit} className="rounded-2xl p-6 space-y-4 max-w-xl" style={cardStyle}>
      <h2 className="text-[14px] font-black text-gray-800">تغییر رمز عبور</h2>
      {error && <Alert kind="error" text={error} />}
      {field("رمز عبور فعلی", currentPassword, setCurrentPassword, "current-password", true)}
      {field("رمز عبور جدید (حداقل ۱۲ کاراکتر، حروف و عدد)", newPassword, setNewPassword, "new-password")}
      {newPassword && (
        <div className="space-y-1">
          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${(strength.score / 5) * 100}%`, backgroundColor: strength.color }}
            />
          </div>
          <p className="text-[11px] font-bold" style={{ color: strength.color }}>
            قدرت رمز: {strength.label}
          </p>
        </div>
      )}
      {field("تکرار رمز عبور جدید", confirmPassword, setConfirmPassword, "new-password")}
      <Alert
        kind="warn"
        text="پس از تغییر رمز عبور، تمام نشست‌های فعال (همه‌ی دستگاه‌ها) باطل می‌شود و باید دوباره وارد شوید."
      />
      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 rounded-xl font-black text-white flex items-center justify-center gap-2 disabled:opacity-60"
        style={{ backgroundColor: "var(--color-emerald)" }}
      >
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "تغییر رمز عبور"}
      </button>
    </form>
  );
}

// ═══════════════════════════ نشست‌ها ═══════════════════════════

interface SessionItem {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
  current: boolean;
}

function describeDevice(ua: string | null) {
  if (!ua) return { label: "دستگاه نامشخص", mobile: false };
  const mobile = /Android|iPhone|iPad|Mobile/i.test(ua);
  const os = /Windows/i.test(ua)
    ? "Windows"
    : /Android/i.test(ua)
      ? "Android"
      : /iPhone|iPad|iOS/i.test(ua)
        ? "iOS"
        : /Mac OS/i.test(ua)
          ? "macOS"
          : /Linux/i.test(ua)
            ? "Linux"
            : "";
  const browser = /Edg\//i.test(ua)
    ? "Edge"
    : /Firefox\//i.test(ua)
      ? "Firefox"
      : /Chrome\//i.test(ua)
        ? "Chrome"
        : /Safari\//i.test(ua)
          ? "Safari"
          : "مرورگر";
  return { label: [browser, os].filter(Boolean).join(" روی "), mobile };
}

function SessionsTab() {
  const { data, isLoading, mutate } = useSWR<SessionItem[]>("/api/admin-auth/sessions", fetcher);
  const { logout, loggingOut } = useLogout();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const revoke = async (s: SessionItem) => {
    if (s.current) return void logout();
    setBusy(s.id);
    setMessage(null);
    try {
      await axios.delete(`/api/admin-auth/sessions/${s.id}`);
      await mutate();
      setMessage({ kind: "success", text: "نشست خاتمه یافت" });
    } catch (err) {
      setMessage({ kind: "error", text: getErrorMessage(err, "خطا در خاتمه نشست") });
    } finally {
      setBusy(null);
    }
  };

  const revokeOthers = async () => {
    setBusy("others");
    setMessage(null);
    try {
      const res = await axios.post<{ message: string }>("/api/admin-auth/sessions/revoke-others");
      await mutate();
      setMessage({ kind: "success", text: res.data.message });
    } catch (err) {
      setMessage({ kind: "error", text: getErrorMessage(err, "خطا در خروج از سایر دستگاه‌ها") });
    } finally {
      setBusy(null);
    }
  };

  const others = (data ?? []).filter((s) => !s.current).length;

  return (
    <div className="rounded-2xl p-6 space-y-4" style={cardStyle}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-[14px] font-black text-gray-800">دستگاه‌ها و نشست‌های فعال</h2>
          <p className="text-[11px] text-gray-400 mt-1">
            اگر دستگاهی را نمی‌شناسید، نشست آن را خاتمه دهید و رمز عبور خود را تغییر دهید.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            disabled={!others || busy === "others"}
            onClick={() => void revokeOthers()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold border-2 border-gray-200 text-gray-700 disabled:opacity-50"
          >
            {busy === "others" ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
            خروج از سایر دستگاه‌ها
          </button>
          <button
            type="button"
            disabled={loggingOut}
            onClick={() => {
              if (confirm("از همه‌ی دستگاه‌ها (از جمله همین دستگاه) خارج می‌شوید. ادامه می‌دهید؟"))
                void logout(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold bg-red-50 text-red-600 border border-red-100 disabled:opacity-50"
          >
            <LogOut className="w-4 h-4" /> خروج از همه دستگاه‌ها
          </button>
        </div>
      </div>

      {message && <Alert kind={message.kind} text={message.text} />}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
        </div>
      ) : (
        <div className="space-y-2">
          {(data ?? []).map((s) => {
            const dev = describeDevice(s.userAgent);
            const Icon = dev.mobile ? Smartphone : Monitor;
            return (
              <div
                key={s.id}
                className={`flex items-center gap-3 p-3 rounded-xl border ${
                  s.current ? "border-emerald-200 bg-emerald-50/50" : "border-gray-100"
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-black text-gray-800 flex items-center gap-2 flex-wrap">
                    {dev.label}
                    {s.current && <span className="badge bg-emerald-100 text-emerald-700">همین دستگاه</span>}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    IP: <span dir="ltr">{s.ip ?? "—"}</span> · ورود: {faDateTime(s.createdAt)} · انقضا:{" "}
                    {faDateTime(s.expiresAt)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy === s.id}
                  onClick={() => void revoke(s)}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  {busy === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : s.current ? "خروج" : "خاتمه"}
                </button>
              </div>
            );
          })}
          {data && data.length === 0 && (
            <p className="text-center text-[12px] text-gray-400 py-6">نشست فعالی یافت نشد</p>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════ فعالیت‌ها ═══════════════════════════

interface ActivityItem {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  ip: string | null;
  success: boolean;
  createdAt: string;
}

const ACTION_FA: Record<string, string> = {
  "admin_auth.login": "ورود به پنل",
  "admin_auth.logout": "خروج از پنل",
  "admin_auth.logout_all": "خروج از همه دستگاه‌ها",
  "admin_auth.change_password": "تغییر رمز عبور",
  "admin_auth.update_profile": "ویرایش پروفایل",
  "admin_auth.revoke_session": "خاتمه نشست",
  "admin_auth.revoke_other_sessions": "خروج از سایر دستگاه‌ها",
  "admin_auth.account_locked": "قفل موقت حساب",
  "admin_auth.permission_denied": "تلاش دسترسی غیرمجاز",
  "agent_portal.sale.create": "ثبت فروش شمش (نمایندگی)",
  "agent_portal.settlement.submit": "اعلام واریز نماینده",
  "agent.stock.allocate": "تحویل امانی شمش به نماینده",
  "agent.stock.return": "عودت شمش از نماینده",
  "agent.sale.void": "ابطال فروش نماینده",
  "agent.settlement.approve": "تأیید تسویه نماینده",
  "agent.settlement.reject": "رد تسویه نماینده",
  "agent.settlement.record": "ثبت دریافت وجه از نماینده",
  "agent.adjustment.create": "اصلاحیه حساب نماینده",
  "agent.create": "تعریف نماینده",
  "agent.update": "ویرایش نماینده",
};

function ActivityTab() {
  const [page, setPage] = useState(1);
  const [onlyAuth, setOnlyAuth] = useState(false);
  const { data, isLoading } = useSWR<{ data: ActivityItem[]; totalPages: number; total: number }>(
    `/api/admin-auth/activity?page=${page}&limit=20${onlyAuth ? "&onlyAuth=true" : ""}`,
    fetcher,
  );

  return (
    <div className="rounded-2xl p-6 space-y-4" style={cardStyle}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-[14px] font-black text-gray-800">
          فعالیت‌های اخیر من
          {data && <span className="text-[11px] text-gray-400 font-bold mr-2">({data.total.toLocaleString("fa-IR")} رویداد)</span>}
        </h2>
        <label className="flex items-center gap-2 text-[12px] font-bold text-gray-600">
          <input
            type="checkbox"
            checked={onlyAuth}
            onChange={(e) => {
              setOnlyAuth(e.target.checked);
              setPage(1);
            }}
          />
          فقط رویدادهای ورود و امنیت
        </label>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table w-full min-w-[560px]">
            <thead>
              <tr>
                <th>رویداد</th>
                <th>نتیجه</th>
                <th>IP</th>
                <th>زمان</th>
              </tr>
            </thead>
            <tbody>
              {(data?.data ?? []).map((a) => (
                <tr key={a.id}>
                  <td>
                    <p className="font-bold text-gray-800">{ACTION_FA[a.action] ?? a.action}</p>
                    {!ACTION_FA[a.action] ? null : (
                      <p className="text-[10px] text-gray-400" dir="ltr">
                        {a.action}
                      </p>
                    )}
                  </td>
                  <td>
                    {a.success ? (
                      <span className="badge bg-green-50 text-green-700">موفق</span>
                    ) : (
                      <span className="badge bg-red-50 text-red-600">ناموفق</span>
                    )}
                  </td>
                  <td dir="ltr" className="text-right text-gray-500">
                    {a.ip ?? "—"}
                  </td>
                  <td className="text-gray-500 whitespace-nowrap">{faDateTime(a.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && data.data.length === 0 && (
            <p className="text-center text-[12px] text-gray-400 py-6">رویدادی ثبت نشده است</p>
          )}
        </div>
      )}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="p-2 rounded-lg border border-gray-200 disabled:opacity-40"
            aria-label="صفحه قبل"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="text-[12px] font-bold text-gray-600">
            صفحه {page.toLocaleString("fa-IR")} از {data.totalPages.toLocaleString("fa-IR")}
          </span>
          <button
            type="button"
            disabled={page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="p-2 rounded-lg border border-gray-200 disabled:opacity-40"
            aria-label="صفحه بعد"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════ دسترسی‌ها ═══════════════════════════

const GROUP_FA: Record<string, string> = {
  wallet: "کیف پول و مالی",
  users: "کاربران",
  delivery: "تحویل فیزیکی",
  shop: "فروشگاه",
  system: "سیستم",
  admin: "مدیریت پنل",
  payroll: "پی‌رول",
  notifications: "اعلان‌ها",
  referral: "دعوت از دوستان",
  accounting: "حسابداری",
  integrations: "یکپارچه‌سازی‌ها",
  tickets: "پشتیبانی",
  hologram: "هولوگرام",
  security: "امنیت",
  agent: "نمایندگان فروش",
  agent_portal: "پرتال نماینده",
};

function PermissionsTab() {
  const { me } = useAdminMe();
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; description: string | null }[]>();
    for (const p of me?.permissionDetails ?? []) {
      const list = map.get(p.group) ?? [];
      list.push({ key: p.key, description: p.description });
      map.set(p.group, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [me]);

  if (!me) return null;
  return (
    <div className="rounded-2xl p-6 space-y-4" style={cardStyle}>
      <div>
        <h2 className="text-[14px] font-black text-gray-800">دسترسی‌های نقش «{me.role.name}»</h2>
        {me.role.description && <p className="text-[12px] text-gray-400 mt-1">{me.role.description}</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {groups.map(([group, perms]) => (
          <div key={group} className="rounded-xl border border-gray-100 p-4">
            <p className="text-[12px] font-black text-gray-700 mb-2">{GROUP_FA[group] ?? group}</p>
            <ul className="space-y-1.5">
              {perms.map((p) => (
                <li key={p.key} className="flex items-start gap-2 text-[11px] text-gray-600">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
                  {p.description ?? p.key}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-gray-400">
        برای تغییر دسترسی‌ها با مدیر ارشد پنل هماهنگ کنید. کد نقش:{" "}
        <span dir="ltr" className="font-mono">
          {me.role.key}
        </span>
      </p>
    </div>
  );
}

// ═══════════════════════════ اجزای مشترک ═══════════════════════════

function Alert({ kind, text }: { kind: "error" | "success" | "warn"; text: string }) {
  const cls =
    kind === "error"
      ? "bg-red-50 border-red-100 text-red-600"
      : kind === "success"
        ? "bg-green-50 border-green-100 text-green-700"
        : "bg-amber-50 border-amber-100 text-amber-700";
  const Icon = kind === "success" ? CheckCircle2 : AlertCircle;
  return (
    <div className={`flex items-start gap-2 p-3 rounded-xl border text-[12px] font-bold ${cls}`}>
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      {text}
    </div>
  );
}

