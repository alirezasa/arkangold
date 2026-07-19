// admin/app/(dashboard)/admins/page.tsx
"use client";
import { useState } from "react";
import useSWR from "swr";
import axios from "axios";
import { Plus, Key, ShieldOff, ShieldCheck, X, Loader2 } from "lucide-react";

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

interface AdminItem {
  id: string;
  username: string;
  fullName: string;
  isActive: boolean;
  totpEnabled: boolean;
  role: { key: string; name: string };
  lastLoginAt: string | null;
}

interface RoleItem {
  id: string;
  key: string;
  name: string;
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
    roleKey: roles[0]?.key ?? "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password.length < 12)
      return setError("رمز عبور باید حداقل ۱۲ کاراکتر باشد");
    setLoading(true);
    setError(null);
    try {
      await axios.post("/api/admin/admins", form);
      onCreated();
      onClose();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message || "خطا در ایجاد ادمین");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      dir="rtl"
    >
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-md rounded-2xl p-6 space-y-4"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-black text-gray-900">ایجاد ادمین جدید</h2>
          <button type="button" onClick={onClose}>
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-50 text-red-600 text-[13px] font-bold">
            {error}
          </div>
        )}

        <input
          placeholder="نام کاربری"
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm"
        />
        <input
          placeholder="نام کامل"
          value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm"
        />
        <input
          type="password"
          placeholder="رمز عبور (حداقل ۱۲ کاراکتر)"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm"
        />
        <select
          value={form.roleKey}
          onChange={(e) => setForm({ ...form, roleKey: e.target.value })}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm"
        >
          {roles.map((r) => (
            <option key={r.key} value={r.key}>
              {r.name}
            </option>
          ))}
        </select>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl font-black text-white"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin mx-auto" />
          ) : (
            "ایجاد ادمین"
          )}
        </button>
      </form>
    </div>
  );
}

export default function AdminsPage() {
  const { data: admins, mutate } = useSWR<AdminItem[]>(
    "/api/admin/admins",
    fetcher,
  );
  const { data: roles } = useSWR<RoleItem[]>(
    "/api/admin/admins/roles",
    fetcher,
  );
  const [showCreate, setShowCreate] = useState(false);

  const toggleActive = async (admin: AdminItem) => {
    if (
      !confirm(
        `آیا مطمئنید می‌خواهید حساب ${admin.username} را ${admin.isActive ? "غیرفعال" : "فعال"} کنید؟`,
      )
    )
      return;
    await axios.patch(`/api/admin/admins/${admin.id}`, {
      isActive: !admin.isActive,
    });
    mutate();
  };

  const resetPassword = async (admin: AdminItem) => {
    const newPassword = prompt(
      `رمز جدید برای ${admin.username} (حداقل ۱۲ کاراکتر):`,
    );
    if (!newPassword) return;
    try {
      await axios.post(`/api/admin/admins/${admin.id}/reset-password`, {
        newPassword,
      });
      alert("رمز عبور با موفقیت بازنشانی شد");
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) alert(err.response?.data?.message || "خطا");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-black text-gray-900">مدیریت ادمین‌ها</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-[13px] font-bold"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          <Plus className="w-4 h-4" /> ادمین جدید
        </button>
      </div>

      <div
        className="rounded-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        <table className="w-full admin-table">
          <thead>
            <tr>
              <th>نام کاربری</th>
              <th>نام کامل</th>
              <th>نقش</th>
              <th>2FA</th>
              <th>وضعیت</th>
              <th>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {admins?.map((a) => (
              <tr key={a.id}>
                <td dir="ltr" className="text-left">
                  {a.username}
                </td>
                <td>{a.fullName}</td>
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
                  <span
                    className="badge"
                    style={{
                      background: a.isActive ? "#dcfce7" : "#fee2e2",
                      color: a.isActive ? "#16a34a" : "#dc2626",
                    }}
                  >
                    {a.isActive ? "فعال" : "غیرفعال"}
                  </span>
                </td>
                <td>
                  <div className="flex gap-2">
                    <button
                      onClick={() => resetPassword(a)}
                      className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
                      title="بازنشانی رمز"
                    >
                      <Key className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => toggleActive(a)}
                      className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
                      title={a.isActive ? "غیرفعال کردن" : "فعال کردن"}
                    >
                      {a.isActive ? (
                        <ShieldOff className="w-4 h-4 text-red-500" />
                      ) : (
                        <ShieldCheck className="w-4 h-4 text-green-500" />
                      )}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
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
    </div>
  );
}
