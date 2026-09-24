// admin/app/(dashboard)/roles/page.tsx
"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import axios from "axios";
import {
  ShieldCheck,
  Plus,
  X,
  Loader2,
  AlertCircle,
  Pencil,
  Trash2,
  Lock,
  Users,
  ArrowRight,
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

interface Permission {
  key: string;
  group: string;
  description: string | null;
}

interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  permissions: Permission[];
}

const GROUP_TITLES: Record<string, string> = {
  wallet: "کیف پول و مالی",
  users: "کاربران",
  notifications: "اعلان‌ها",
  delivery: "تحویل فیزیکی",
  shop: "فروشگاه",
  payroll: "پی‌رول",
  referral: "معرفی دوستان",
  accounting: "حسابداری",
  tickets: "تیکت‌ها",
  hologram: "هولوگرام",
  integrations: "یکپارچه‌سازی‌ها",
  system: "تنظیمات سیستم",
  admin: "مدیریت پنل",
  security: "امنیت",
};

function groupPermissions(permissions: Permission[]) {
  const map = new Map<string, Permission[]>();
  for (const p of permissions) {
    if (!map.has(p.group)) map.set(p.group, []);
    map.get(p.group)!.push(p);
  }
  const order = Object.keys(GROUP_TITLES);
  return [...map.entries()].sort(
    ([a], [b]) =>
      (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) -
      (order.indexOf(b) === -1 ? 99 : order.indexOf(b)),
  );
}

function RoleModal({
  role,
  permissions,
  onClose,
  onSaved,
}: {
  role: Role | null;
  permissions: Permission[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = role !== null;
  const [key, setKey] = useState(role?.key ?? "");
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(role?.permissions.map((p) => p.key) ?? []),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groups = useMemo(() => groupPermissions(permissions), [permissions]);

  const toggle = (k: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const toggleGroup = (items: Permission[]) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = items.every((p) => next.has(p.key));
      for (const p of items) {
        if (allOn) next.delete(p.key);
        else next.add(p.key);
      }
      return next;
    });

  const submit = async () => {
    if (!isEdit && !/^[A-Za-z][A-Za-z0-9_]{2,39}$/.test(key.trim()))
      return setError("کلید نقش باید انگلیسی باشد (مثلا CONTENT_ADMIN)");
    if (name.trim().length < 2) return setError("نام نقش را وارد کنید");
    if (selected.size === 0) return setError("حداقل یک دسترسی انتخاب کنید");
    setLoading(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        permissionKeys: [...selected],
      };
      if (isEdit) {
        await axios.patch(`/api/admin/admins/roles/${role.id}`, payload);
      } else {
        await axios.post("/api/admin/admins/roles", {
          ...payload,
          key: key.trim().toUpperCase(),
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "خطا در ذخیره نقش"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative w-full max-w-2xl rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-black text-gray-900 text-[15px]">
            {isEdit ? `ویرایش نقش «${role.name}»` : "ایجاد نقش جدید"}
          </h2>
          <button onClick={onClose}>
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-600 text-[13px] font-bold">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[12px] font-bold text-gray-500 mb-1 block">نام نقش</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثلا: کارشناس محتوا"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-gold-500"
            />
          </div>
          <div>
            <label className="text-[12px] font-bold text-gray-500 mb-1 block">
              کلید نقش (انگلیسی)
            </label>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value.toUpperCase())}
              disabled={isEdit}
              placeholder="CONTENT_ADMIN"
              dir="ltr"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-gold-500 disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>
        </div>
        <div>
          <label className="text-[12px] font-bold text-gray-500 mb-1 block">توضیحات</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-gold-500"
          />
        </div>

        <div>
          <p className="text-[12px] font-bold text-gray-500 mb-2">
            دسترسی‌ها ({selected.size.toLocaleString("fa-IR")} مورد انتخاب شده)
          </p>
          <div className="space-y-3">
            {groups.map(([group, items]) => {
              const allOn = items.every((p) => selected.has(p.key));
              return (
                <div key={group} className="rounded-xl border border-gray-100 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[12px] font-black text-gray-700">
                      {GROUP_TITLES[group] ?? group}
                    </p>
                    <button
                      type="button"
                      onClick={() => toggleGroup(items)}
                      className="text-[11px] font-bold text-emerald-700"
                    >
                      {allOn ? "برداشتن همه" : "انتخاب همه"}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {items.map((p) => (
                      <label
                        key={p.key}
                        className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-[12px] hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(p.key)}
                          onChange={() => toggle(p.key)}
                          className="mt-0.5 accent-emerald-700"
                        />
                        <span>
                          <span className="font-bold text-gray-700">
                            {p.description ?? p.key}
                          </span>
                          <span className="block text-[10px] text-gray-400" dir="ltr">
                            {p.key}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <button
          onClick={submit}
          disabled={loading}
          className="w-full py-3 rounded-xl font-black text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin mx-auto" />
          ) : isEdit ? (
            "ذخیره تغییرات"
          ) : (
            "ایجاد نقش"
          )}
        </button>
      </div>
    </div>
  );
}

export default function RolesPage() {
  const { data: roles, error, mutate } = useSWR<Role[]>(
    "/api/admin/admins/roles",
    fetcher,
  );
  const { data: permissions } = useSWR<Permission[]>(
    "/api/admin/admins/permissions",
    fetcher,
  );
  const [modalRole, setModalRole] = useState<Role | null | undefined>(undefined);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const removeRole = async (role: Role) => {
    if (!confirm(`نقش «${role.name}» حذف شود؟`)) return;
    setActionError(null);
    try {
      await axios.delete(`/api/admin/admins/roles/${role.id}`);
      await mutate();
    } catch (err) {
      setActionError(getErrorMessage(err, "خطا در حذف نقش"));
    }
  };

  return (
    <div>
      <Link
        href="/admins"
        className="inline-flex items-center gap-1 text-[12px] font-bold text-gray-400 hover:text-gray-600 mb-2"
      >
        <ArrowRight className="w-3.5 h-3.5" />
        مدیریت ادمین‌ها
      </Link>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-black text-gray-900 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-gray-400" />
          نقش‌ها و دسترسی‌ها
        </h1>
        <button
          onClick={() => setModalRole(null)}
          disabled={!permissions}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          <Plus className="w-4 h-4" />
          نقش جدید
        </button>
      </div>
      <p className="text-[12px] text-gray-400 mb-5">
        نقش‌های سیستمی از کد همگام می‌شوند و قابل ویرایش نیستند؛ برای نیازهای خاص
        نقش سفارشی با دسترسی‌های دلخواه بسازید.
      </p>

      {(error || actionError) && (
        <div className="flex items-start gap-2 p-3 mb-4 rounded-xl bg-red-50 text-red-600 text-[13px] font-bold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {actionError ?? getErrorMessage(error, "خطا در دریافت نقش‌ها")}
        </div>
      )}

      {!roles && !error ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {roles?.map((role) => {
            const isOpen = expanded === role.id;
            return (
              <div
                key={role.id}
                className="rounded-2xl p-4"
                style={{
                  backgroundColor: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[14px] font-black text-gray-900">{role.name}</p>
                      {role.isSystem ? (
                        <span
                          className="badge flex items-center gap-1"
                          style={{ background: "#f3f4f6", color: "#6b7280" }}
                        >
                          <Lock className="w-3 h-3" /> سیستمی
                        </span>
                      ) : (
                        <span className="badge" style={{ background: "#fbf8eb", color: "#8c703b" }}>
                          سفارشی
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5" dir="ltr" style={{ textAlign: "right" }}>
                      {role.key}
                    </p>
                    {role.description && (
                      <p className="text-[12px] text-gray-500 mt-1">{role.description}</p>
                    )}
                  </div>
                  {!role.isSystem && (
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => setModalRole(role)}
                        disabled={!permissions}
                        className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
                        title="ویرایش"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => removeRole(role)}
                        disabled={role.userCount > 0}
                        className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-30"
                        title={role.userCount > 0 ? "این نقش به ادمین‌هایی اختصاص دارد" : "حذف"}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-4 mt-3 text-[11px] text-gray-400">
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {role.userCount.toLocaleString("fa-IR")} ادمین
                  </span>
                  <span>{role.permissions.length.toLocaleString("fa-IR")} دسترسی</span>
                  <button
                    onClick={() => setExpanded(isOpen ? null : role.id)}
                    className="mr-auto font-bold text-emerald-700"
                  >
                    {isOpen ? "بستن" : "مشاهده دسترسی‌ها"}
                  </button>
                </div>

                {isOpen && (
                  <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                    {groupPermissions(role.permissions).map(([group, items]) => (
                      <div key={group}>
                        <p className="text-[11px] font-black text-gray-500 mb-1">
                          {GROUP_TITLES[group] ?? group}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {items.map((p) => (
                            <span
                              key={p.key}
                              className="rounded-full bg-gray-50 px-2.5 py-1 text-[11px] font-bold text-gray-600"
                            >
                              {p.description ?? p.key}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modalRole !== undefined && permissions && (
        <RoleModal
          role={modalRole}
          permissions={permissions}
          onClose={() => setModalRole(undefined)}
          onSaved={() => mutate()}
        />
      )}
    </div>
  );
}
