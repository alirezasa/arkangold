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
  role: { id: string; key: string; name: string };
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  isLocked: boolean;
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
  role: { key: string };
}

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
        className="relative w-full max-w-md rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
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

function RoleSelect({
  roles,
  value,
  onChange,
}: {
  roles: RoleItem[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputClass} bg-white`}
    >
      {roles.map((r) => (
        <option key={r.key} value={r.key}>
          {r.name}
          {r.isSystem ? "" : " (سفارشی)"}
        </option>
      ))}
    </select>
  );
}

function CreateAdminModal({
  roles,
  onClose,
  onCreated,
}: {
  roles: RoleItem[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    username: "",
    password: "",
    fullName: "",
    phone: "",
    roleKey: roles.find((r) => r.key !== "SUPER_ADMIN")?.key ?? roles[0]?.key ?? "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.username.trim()) return setError("نام کاربری را وارد کنید");
    if (!form.fullName.trim()) return setError("نام کامل را وارد کنید");
    if (form.password.length < 12)
      return setError("رمز عبور باید حداقل ۱۲ کاراکتر باشد");
    if (!form.roleKey) return setError("نقش ادمین را انتخاب کنید");
    setLoading(true);
    setError(null);
    try {
      await axios.post("/api/admin/admins", {
        ...form,
        username: form.username.trim(),
        fullName: form.fullName.trim(),
        phone: form.phone.trim() || undefined,
      });
      onCreated();
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
            شماره موبایل (برای پیامک تیکت‌های ارجاع‌شده)
          </label>
          <input
            dir="ltr"
            placeholder="09xxxxxxxxx"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label className="text-[12px] font-bold text-gray-500 mb-1 block">
            رمز عبور (حداقل ۱۲ کاراکتر)
          </label>
          <input
            type="password"
            dir="ltr"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label className="text-[12px] font-bold text-gray-500 mb-1 block">نقش</label>
          <RoleSelect
            roles={roles}
            value={form.roleKey}
            onChange={(roleKey) => setForm({ ...form, roleKey })}
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
    roleKey: admin.role.key,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim()) return setError("نام کامل را وارد کنید");
    setLoading(true);
    setError(null);
    try {
      await axios.patch(`/api/admin/admins/${admin.id}`, {
        fullName: form.fullName.trim(),
        phone: form.phone.trim() || undefined,
        // نقش فقط در صورت تغییر ارسال می‌شود (تغییر نقش، نشست‌های ادمین را می‌بندد)
        roleKey: form.roleKey !== admin.role.key ? form.roleKey : undefined,
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
          <label className="text-[12px] font-bold text-gray-500 mb-1 block">نقش</label>
          {isSelf ? (
            <p className="text-[12px] text-gray-400">
              {admin.role.name} — امکان تغییر نقش حساب خودتان وجود ندارد
            </p>
          ) : (
            <>
              <RoleSelect
                roles={roles}
                value={form.roleKey}
                onChange={(roleKey) => setForm({ ...form, roleKey })}
              />
              {form.roleKey !== admin.role.key && (
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

function ResetPasswordModal({
  admin,
  onClose,
}: {
  admin: AdminItem;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 12) return setError("رمز عبور باید حداقل ۱۲ کاراکتر باشد");
    if (password !== confirm) return setError("تکرار رمز عبور مطابقت ندارد");
    setLoading(true);
    setError(null);
    try {
      await axios.post(`/api/admin/admins/${admin.id}/reset-password`, {
        newPassword: password,
      });
      setDone(true);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "خطا در بازنشانی رمز"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title={`بازنشانی رمز ${admin.username}`} onClose={onClose}>
      {done ? (
        <div className="space-y-3 text-center">
          <p className="text-[13px] font-bold text-green-700">
            رمز عبور بازنشانی شد و همه نشست‌های این ادمین بسته شد.
          </p>
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl font-black text-white"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            بستن
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <ErrorBox message={error} />
          <input
            type="password"
            dir="ltr"
            autoComplete="new-password"
            placeholder="رمز جدید (حداقل ۱۲ کاراکتر)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
          <input
            type="password"
            dir="ltr"
            autoComplete="new-password"
            placeholder="تکرار رمز جدید"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputClass}
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-black text-white disabled:opacity-60"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "بازنشانی رمز"}
          </button>
        </form>
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
  const [resetting, setResetting] = useState<AdminItem | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
        ایجاد ادمین با نقش مشخص، ویرایش، غیرفعال‌سازی، بازنشانی رمز و بستن نشست‌ها
      </p>

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
                  <td>{a.role.name}</td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        background: a.totpEnabled ? "#dcfce7" : "#f3f4f6",
                        color: a.totpEnabled ? "#16a34a" : "#9ca3af",
                      }}
                    >
                      {a.totpEnabled ? "فعال" : "غیرفعال"}
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
                      <IconButton title="بازنشانی رمز" onClick={() => setResetting(a)}>
                        <Key className="w-4 h-4" />
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
          onCreated={() => mutate()}
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
        <ResetPasswordModal
          admin={resetting}
          onClose={() => {
            setResetting(null);
            void mutate();
          }}
        />
      )}
    </div>
  );
}
