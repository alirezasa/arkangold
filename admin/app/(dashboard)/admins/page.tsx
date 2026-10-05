// admin/app/(dashboard)/admins/page.tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import axios from "axios";
import {
  Plus,
  Key,
  ShieldOff,
  ShieldCheck,
  X,
  Loader2,
  Pencil,
  LogOut,
  LockOpen,
  AlertCircle,
  UserCog,
  Smartphone,
  CheckCircle2,
} from "lucide-react";

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

function getErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as
      | { message?: string | string[] }
      | undefined;
    if (data?.message)
      return Array.isArray(data.message) ? data.message[0] : data.message;
  }
  return fallback;
}

interface AdminItem {
  id: string;
  username: string;
  fullName: string;
  phone: string | null;
  isActive: boolean;
  totpEnabled: boolean;
  /** نقش اصلی (برای سازگاری) */
  role: { id: string; key: string; name: string } | null;
  /** همه‌ی نقش‌های ادمین — یک ادمین می‌تواند هم‌زمان چند نقش داشته باشد */
  roles: { id: string; key: string; name: string }[];
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  isLocked: boolean;
  mustChangePassword?: boolean;
  passwordExpiresAt?: string | null;
  lockedUntil: string | null;
  activeSessions: number;
  createdBy: string | null;
  createdAt: string;
}

interface RoleItem {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
}

interface Me {
  id: string;
}

/** نقش حساب‌های ورود نماینده — فقط از بخش نمایندگان تعریف می‌شود */
const AGENT_ROLE_KEY = "AGENT";

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative w-full max-w-lg rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-black text-gray-900">{title}</h2>
          <button type="button" onClick={onClose}>
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-600 text-[13px] font-bold">
      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
      {message}
    </div>
  );
}

const inputClass =
  "w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-gold-500";

function RoleMultiSelect({
  roles,
  value,
  onChange,
}: {
  roles: RoleItem[];
  value: string[];
  onChange: (keys: string[]) => void;
}) {
  const options = roles.filter((r) => r.key !== AGENT_ROLE_KEY);
  const toggle = (key: string) =>
    onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {options.map((r) => {
          const checked = value.includes(r.key);
          return (
            <label
              key={r.key}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer text-[13px] font-bold transition-colors ${
                checked
                  ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(r.key)}
                className="accent-emerald-600 w-4 h-4 shrink-0"
              />
              <span className="truncate">
                {r.name}
                {r.isSystem ? "" : " (سفارشی)"}
              </span>
            </label>
          );
        })}
      </div>
      <p className="text-[11px] text-gray-400">
        می‌توانید چند نقش را هم‌زمان انتخاب کنید؛ دسترسی‌های ادمین مجموع دسترسی‌های همه‌ی نقش‌هاست.
      </p>
    </div>
  );
}

function RoleBadges({ roles }: { roles: AdminItem["roles"] }) {
  if (roles.length === 0) return <span className="text-gray-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((r) => (
        <span
          key={r.key}
          className="badge"
          style={{ background: "#ecfdf5", color: "#047857" }}
        >
          {r.name}
        </span>
      ))}
    </div>
  );
}

const sameKeys = (a: string[], b: string[]) =>
  a.length === b.length && a.every((k) => b.includes(k));

function CreateAdminModal({
  roles,
  onClose,
  onCreated,
}: {
  roles: RoleItem[];
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const [form, setForm] = useState({
    username: "",
    fullName: "",
    phone: "",
    roleKeys: [] as string[],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.username.trim()) return setError("نام کاربری را وارد کنید");
    if (!form.fullName.trim()) return setError("نام کامل را وارد کنید");
    if (!/^09\d{9}$/.test(form.phone.trim()))
      return setError("شماره موبایل (۱۱ رقم، شروع با ۰۹) برای ارسال رمز موقت لازم است");
    if (form.roleKeys.length === 0) return setError("حداقل یک نقش برای ادمین انتخاب کنید");
    setLoading(true);
    setError(null);
    try {
      const { data } = await axios.post("/api/admin/admins", {
        ...form,
        username: form.username.trim(),
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
      });
      onCreated(data?.message ?? "حساب ساخته شد");
      onClose();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "خطا در ایجاد ادمین"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="ایجاد ادمین جدید" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <ErrorBox message={error} />
        <div>
          <label className="text-[12px] font-bold text-gray-500 mb-1 block">نام کاربری</label>
          <input
            dir="ltr"
            autoComplete="off"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label className="text-[12px] font-bold text-gray-500 mb-1 block">نام کامل</label>
          <input
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label className="text-[12px] font-bold text-gray-500 mb-1 block">
            شماره موبایل (اجباری — رمز موقت، هشدارهای امنیتی و پیامک تیکت‌ها)
          </label>
          <input
            dir="ltr"
            placeholder="09xxxxxxxxx"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className={inputClass}
          />
        </div>
        <p className="text-[11px] leading-5 text-gray-500 rounded-xl bg-gray-50 p-3">
          رمز عبور را شما تعیین نمی‌کنید: سیستم یک رمز موقت تصادفی (۲۴ ساعت اعتبار) می‌سازد و فقط به موبایل
          همین شخص پیامک می‌کند. او در اولین ورود باید رمز را تغییر دهد و برنامه‌ی احراز هویت را راه‌اندازی کند.
          نام‌های پیش‌فرض مثل admin، root یا test مجاز نیستند.
        </p>
        <div>
          <label className="text-[12px] font-bold text-gray-500 mb-1 block">نقش‌ها</label>
          <RoleMultiSelect
            roles={roles}
            value={form.roleKeys}
            onChange={(roleKeys) => setForm({ ...form, roleKeys })}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl font-black text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "ایجاد ادمین"}
        </button>
      </form>
    </Modal>
  );
}

function EditAdminModal({
  admin,
  roles,
  isSelf,
  onClose,
  onSaved,
}: {
  admin: AdminItem;
  roles: RoleItem[];
  isSelf: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    fullName: admin.fullName,
    phone: admin.phone ?? "",
    roleKeys: admin.roles.map((r) => r.key),
  });
  const currentKeys = admin.roles.map((r) => r.key);
  const rolesChanged = !sameKeys(form.roleKeys, currentKeys);
  const isAgentAccount = currentKeys.includes(AGENT_ROLE_KEY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim()) return setError("نام کامل را وارد کنید");
    if (form.roleKeys.length === 0) return setError("حداقل یک نقش برای ادمین انتخاب کنید");
    setLoading(true);
    setError(null);
    try {
      await axios.patch(`/api/admin/admins/${admin.id}`, {
        fullName: form.fullName.trim(),
        phone: form.phone.trim() || undefined,
        // نقش‌ها فقط در صورت تغییر ارسال می‌شوند (تغییر نقش، نشست‌های ادمین را می‌بندد)
        roleKeys: rolesChanged ? form.roleKeys : undefined,
      });
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "خطا در ویرایش ادمین"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title={`ویرایش ${admin.username}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <ErrorBox message={error} />
        <div>
          <label className="text-[12px] font-bold text-gray-500 mb-1 block">نام کامل</label>
          <input
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label className="text-[12px] font-bold text-gray-500 mb-1 block">شماره موبایل</label>
          <input
            dir="ltr"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label className="text-[12px] font-bold text-gray-500 mb-1 block">نقش‌ها</label>
          {isSelf || isAgentAccount ? (
            <div className="space-y-1.5">
              <RoleBadges roles={admin.roles} />
              <p className="text-[12px] text-gray-400">
                {isSelf
                  ? "امکان تغییر نقش حساب خودتان وجود ندارد"
                  : "نقش حساب ورود نماینده از بخش نمایندگان مدیریت می‌شود"}
              </p>
            </div>
          ) : (
            <>
              <RoleMultiSelect
                roles={roles}
                value={form.roleKeys}
                onChange={(roleKeys) => setForm({ ...form, roleKeys })}
              />
              {rolesChanged && (
                <p className="text-[11px] text-amber-600 mt-1">
                  با تغییر نقش، همه نشست‌های فعال این ادمین بسته می‌شود.
                </p>
              )}
            </>
          )}
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl font-black text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "ذخیره تغییرات"}
        </button>
      </form>
    </Modal>
  );
}

/**
 * اقدام امنیتی روی حساب ادمین دیگر بدون دیدن یا تعیین رمز (FIA_UID_EXT.1.6):
 * ارسال رمز موقت جدید یا ابطال برنامه‌ی احراز هویت (به‌همراه رمز موقت جدید).
 */
function SecurityActionModal({
  admin,
  kind,
  onClose,
}: {
  admin: AdminItem;
  kind: "reset-password" | "reset-mfa";
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const title =
    kind === "reset-password"
      ? `ارسال رمز موقت جدید برای ${admin.username}`
      : `بازنشانی ورود دومرحله‌ای ${admin.username}`;

  const confirmAction = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await axios.post(`/api/admin/admins/${admin.id}/${kind}`);
      setDone(data?.message ?? "انجام شد");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "انجام عملیات ممکن نشد"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title={title} onClose={onClose}>
      {done ? (
        <div className="space-y-3 text-center">
          <p className="text-[13px] font-bold text-green-700 leading-6">{done}</p>
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl font-black text-white"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            بستن
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <ErrorBox message={error} />
          <p className="text-[12px] leading-6 text-gray-600">
            {kind === "reset-password"
              ? "سیستم یک رمز موقت تصادفی با اعتبار ۲۴ ساعت می‌سازد و فقط به موبایل ثبت‌شده‌ی این حساب پیامک می‌کند؛ شما رمز را نمی‌بینید. همه‌ی نشست‌های فعلی او بسته می‌شود و در ورود بعدی باید رمز را تغییر دهد."
              : "برای وقتی که گوشی یا برنامه‌ی احراز هویت گم یا سرقت شده است. برنامه‌ی فعلی و کدهای بازیابی فوراً باطل، همه‌ی نشست‌ها بسته و رمز موقت جدید به موبایل ثبت‌شده پیامک می‌شود؛ صاحب حساب در ورود بعدی برنامه را دوباره راه‌اندازی می‌کند. پیش از انجام، هویت درخواست‌کننده را تأیید کنید."}
          </p>
          <p className="text-[12px] text-gray-500">
            موبایل ثبت‌شده: <bdi dir="ltr">{admin.phone ?? "ثبت نشده"}</bdi>
          </p>
          <button
            type="button"
            onClick={confirmAction}
            disabled={loading || !admin.phone}
            className={`w-full py-3 rounded-xl font-black text-white disabled:opacity-60 ${kind === "reset-mfa" ? "bg-red-600" : ""}`}
            style={kind === "reset-mfa" ? undefined : { backgroundColor: "var(--color-emerald)" }}
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin mx-auto" />
            ) : kind === "reset-password" ? (
              "ارسال رمز موقت"
            ) : (
              "ابطال برنامه‌ی احراز هویت"
            )}
          </button>
          {!admin.phone && (
            <p className="text-[11px] text-amber-700">ابتدا از «ویرایش» شماره موبایل این حساب را ثبت کنید.</p>
          )}
        </div>
      )}
    </Modal>
  );
}

function IconButton({
  title,
  onClick,
  children,
  disabled,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
      title={title}
      aria-label={title}
    >
      {children}
    </button>
  );
}

export default function AdminsPage() {
  const { data: admins, error: listError, mutate } = useSWR<AdminItem[]>(
    "/api/admin/admins",
    fetcher,
  );
  const { data: roles, error: rolesError } = useSWR<RoleItem[]>(
    "/api/admin/admins/roles",
    fetcher,
  );
  const { data: me } = useSWR<Me>("/api/admin-auth/me", fetcher);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<AdminItem | null>(null);
  const [resetting, setResetting] = useState<{
    admin: AdminItem;
    kind: "reset-password" | "reset-mfa";
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>, fallback: string) => {
    setActionError(null);
    try {
      await fn();
      await mutate();
    } catch (err: unknown) {
      setActionError(getErrorMessage(err, fallback));
    }
  };

  const toggleActive = (admin: AdminItem) => {
    if (
      !confirm(
        `آیا مطمئنید می‌خواهید حساب ${admin.username} را ${admin.isActive ? "غیرفعال" : "فعال"} کنید؟`,
      )
    )
      return;
    void run(
      () => axios.patch(`/api/admin/admins/${admin.id}`, { isActive: !admin.isActive }),
      "خطا در تغییر وضعیت",
    );
  };

  const revokeSessions = (admin: AdminItem) => {
    if (!confirm(`همه نشست‌های فعال ${admin.username} بسته شود؟`)) return;
    void run(
      () => axios.post(`/api/admin/admins/${admin.id}/revoke-sessions`),
      "خطا در بستن نشست‌ها",
    );
  };

  const unlock = (admin: AdminItem) =>
    void run(
      () => axios.post(`/api/admin/admins/${admin.id}/unlock`),
      "خطا در رفع قفل",
    );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h1 className="text-lg font-black text-gray-900 flex items-center gap-2">
          <UserCog className="w-5 h-5 text-gray-400" />
          مدیریت ادمین‌ها
        </h1>
        <div className="flex gap-2">
          <Link
            href="/roles"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold border border-gray-200 text-gray-600 bg-white"
          >
            <ShieldCheck className="w-4 h-4" /> نقش‌ها و دسترسی‌ها
          </Link>
          <button
            onClick={() => setShowCreate(true)}
            disabled={!roles}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-[13px] font-bold disabled:opacity-60"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            <Plus className="w-4 h-4" /> ادمین جدید
          </button>
        </div>
      </div>
      <p className="text-[12px] text-gray-400 mb-5">
        ایجاد ادمین با یک یا چند نقش، ویرایش، غیرفعال‌سازی، ارسال رمز موقت، بازنشانی ورود دومرحله‌ای و بستن نشست‌ها
      </p>

      {notice && (
        <div className="mb-4 p-3 rounded-xl bg-green-50 border border-green-100 text-green-700 text-[13px] font-bold flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          {notice}
        </div>
      )}

      {(actionError || listError || rolesError) && (
        <div className="mb-4">
          <ErrorBox
            message={
              actionError ??
              getErrorMessage(listError ?? rolesError, "خطا در دریافت اطلاعات")
            }
          />
        </div>
      )}

      <div
        className="rounded-2xl overflow-x-auto"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        <table className="w-full admin-table min-w-[900px]">
          <thead>
            <tr>
              <th>نام کاربری</th>
              <th>نام کامل</th>
              <th>شماره موبایل</th>
              <th>نقش</th>
              <th>2FA</th>
              <th>وضعیت</th>
              <th>آخرین ورود</th>
              <th>نشست فعال</th>
              <th>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {!admins && !listError && (
              <tr>
                <td colSpan={9} className="text-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-300 mx-auto" />
                </td>
              </tr>
            )}
            {admins?.map((a) => {
              const isSelf = me?.id === a.id;
              return (
                <tr key={a.id}>
                  <td dir="ltr" className="text-left">
                    {a.username}
                    {isSelf && <span className="text-[10px] text-gray-400 mr-1">(شما)</span>}
                  </td>
                  <td>{a.fullName}</td>
                  <td dir="ltr" className="text-left">
                    {a.phone ?? "—"}
                  </td>
                  <td>
                    <RoleBadges roles={a.roles} />
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        background: a.totpEnabled ? "#dcfce7" : "#f3f4f6",
                        color: a.totpEnabled ? "#16a34a" : "#9ca3af",
                      }}
                    >
                      {a.totpEnabled ? "فعال" : "راه‌اندازی نشده"}
                    </span>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      <span
                        className="badge"
                        style={{
                          background: a.isActive ? "#dcfce7" : "#fee2e2",
                          color: a.isActive ? "#16a34a" : "#dc2626",
                        }}
                      >
                        {a.isActive ? "فعال" : "غیرفعال"}
                      </span>
                      {a.isLocked && (
                        <span
                          className="badge"
                          style={{ background: "#fef3c7", color: "#b45309" }}
                        >
                          قفل موقت
                        </span>
                      )}
                      {a.mustChangePassword && (
                        <span
                          className="badge"
                          style={
                            a.passwordExpiresAt && new Date(a.passwordExpiresAt) < new Date()
                              ? { background: "#fee2e2", color: "#dc2626" }
                              : { background: "#e0f2fe", color: "#0369a1" }
                          }
                        >
                          {a.passwordExpiresAt && new Date(a.passwordExpiresAt) < new Date()
                            ? "رمز موقت منقضی"
                            : "رمز موقت"}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="text-[12px] text-gray-500">
                    {a.lastLoginAt
                      ? new Date(a.lastLoginAt).toLocaleString("fa-IR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })
                      : "—"}
                  </td>
                  <td>{a.activeSessions.toLocaleString("fa-IR")}</td>
                  <td>
                    <div className="flex gap-1">
                      <IconButton title="ویرایش" onClick={() => setEditing(a)}>
                        <Pencil className="w-4 h-4" />
                      </IconButton>
                      <IconButton
                        title="ارسال رمز موقت جدید (پیامک)"
                        onClick={() => setResetting({ admin: a, kind: "reset-password" })}
                      >
                        <Key className="w-4 h-4" />
                      </IconButton>
                      <IconButton
                        title="بازنشانی ورود دومرحله‌ای (گم شدن گوشی)"
                        onClick={() => setResetting({ admin: a, kind: "reset-mfa" })}
                        disabled={isSelf || !a.totpEnabled}
                      >
                        <Smartphone className="w-4 h-4" />
                      </IconButton>
                      <IconButton
                        title="بستن همه نشست‌ها"
                        onClick={() => revokeSessions(a)}
                        disabled={isSelf || a.activeSessions === 0}
                      >
                        <LogOut className="w-4 h-4" />
                      </IconButton>
                      {a.isLocked && (
                        <IconButton title="رفع قفل حساب" onClick={() => unlock(a)}>
                          <LockOpen className="w-4 h-4 text-amber-600" />
                        </IconButton>
                      )}
                      <IconButton
                        title={a.isActive ? "غیرفعال کردن" : "فعال کردن"}
                        onClick={() => toggleActive(a)}
                        disabled={isSelf}
                      >
                        {a.isActive ? (
                          <ShieldOff className="w-4 h-4 text-red-500" />
                        ) : (
                          <ShieldCheck className="w-4 h-4 text-green-500" />
                        )}
                      </IconButton>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showCreate && roles && (
        <CreateAdminModal
          roles={roles}
          onClose={() => setShowCreate(false)}
          onCreated={(message) => {
            setNotice(message);
            void mutate();
          }}
        />
      )}
      {editing && roles && (
        <EditAdminModal
          admin={editing}
          roles={roles}
          isSelf={me?.id === editing.id}
          onClose={() => setEditing(null)}
          onSaved={() => mutate()}
        />
      )}
      {resetting && (
        <SecurityActionModal
          admin={resetting.admin}
          kind={resetting.kind}
          onClose={() => {
            setResetting(null);
            void mutate();
          }}
        />
      )}
    </div>
  );
}
