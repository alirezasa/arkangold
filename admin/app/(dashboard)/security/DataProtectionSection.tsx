// admin/app/(dashboard)/security/DataProtectionSection.tsx
// بخش «حفاظت داده و فایل» پنل امنیت (کلاس‌های FDP و FPT) — وضعیت و تنظیم کنترل‌ها
"use client";
import { useState } from "react";
import useSWR from "swr";
import axios from "axios";
import {
  Activity,
  EyeOff,
  FileWarning,
  Globe,
  Loader2,
  Lock,
  Save,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useAdminMe } from "@/app/hooks/useAdminMe";
import { BAD, Badge, Card, OK, StatTile, Tech, WARN, fa, fetcher, getErrorMessage } from "./ui";

interface Policy {
  purpose: string;
  allowedExtensions: string[];
  maxBytes: number;
  maxImageDimension: number | null;
  archiveInnerExtensions: string[] | null;
  archiveLimits: { maxEntries: number; maxTotalUncompressed: number; maxCompressionRatio: number } | null;
}

interface DataProtectionStatus {
  session: {
    bindingEnabled: boolean;
    adminIpBinding: boolean;
    ipAllowlist: string;
    allowedHours: string;
    contextAvailable: boolean;
    allowlistInvalid: string[];
    allowedHoursValid: boolean;
    events7d: { userTerminated: number; adminTerminated: number; networkChanged: number; loginDenied: number };
  };
  rbac: { defaultDeny: boolean; undeclared7d: number; denied7d: number };
  masking: { reveals7d: { users: number; admins: number } };
  dualControl: { thresholdRial: string; pendingAboveThreshold: number };
  antivirus: {
    mode: "auto" | "required" | "off";
    configured: boolean;
    reachable: boolean | null;
    version: string | null;
    malware7d: number;
  };
  uploads: {
    maxImagePixels: number;
    rejected7d: number;
    rejectedByReason: Record<string, number>;
    policies: Policy[];
  };
  resilience: { circuits: { name: string; state: "CLOSED" | "OPEN" | "HALF_OPEN"; failures: number; openedAt: string | null }[] };
}

const PURPOSE_FA: Record<string, string> = {
  legal_document: "مدارک حقوقی",
  ticket_attachment: "پیوست تیکت",
  deposit_receipt: "رسید واریز",
  catalog_image: "تصاویر فروشگاه",
};
const REASON_FA: Record<string, string> = {
  CONTENT_TYPE_MISMATCH: "محتوا با پسوند نمی‌خواند",
  INVALID_FILE_EXTENSION: "پسوند غیرمجاز",
  FILE_TOO_LARGE: "حجم زیاد",
  MALWARE_DETECTED: "بدافزار",
  IMAGE_TOO_LARGE: "ابعاد تصویر زیاد",
  PDF_ACTIVE_CONTENT: "PDF با اسکریپت",
  OFFICE_ACTIVE_CONTENT: "آفیس با ماکرو",
  ARCHIVE_SYMLINK: "آرشیو با symlink",
  ARCHIVE_PATH_TRAVERSAL: "آرشیو با مسیر نامعتبر",
  ARCHIVE_RATIO: "ZIP bomb",
};
const AV_MODE_FA = { auto: "خودکار", required: "اجباری", off: "خاموش" } as const;
const CIRCUIT_FA: Record<string, string> = { zarinpal: "درگاه زرین‌پال", finotech: "استعلام‌های فینوتک" };
const mb = (b: number) => `${fa(Math.round(b / 1024 / 1024))} مگابایت`;

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-6 rounded-full transition-colors disabled:opacity-50 ${checked ? "bg-emerald-500" : "bg-gray-300"}`}
    >
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${checked ? "right-0.5" : "right-[18px]"}`} />
    </button>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[12px] font-bold text-gray-700">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-gray-400">{hint}</span>}
    </label>
  );
}

const inputCls = "w-full px-3 py-2 rounded-xl border border-gray-200 text-[12px] focus:outline-none focus:border-emerald-400 disabled:bg-gray-50";

export default function DataProtectionSection() {
  const { data, isLoading, error, mutate } = useSWR<DataProtectionStatus>("/api/admin/security/data-protection", fetcher, {
    revalidateOnFocus: false,
  });
  // پیام ذخیره در والد نگه داشته می‌شود تا با مقداردهی دوباره‌ی فرم از بین نرود
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
  // فرم با هر بار دریافت تنظیمات تازه از نو مقداردهی می‌شود
  const settingsKey = [
    data.session.bindingEnabled,
    data.session.adminIpBinding,
    data.session.ipAllowlist,
    data.session.allowedHours,
    data.antivirus.mode,
    data.uploads.maxImagePixels,
    data.dualControl.thresholdRial,
  ].join("|");
  return (
    <DataProtectionView
      key={settingsKey}
      data={data}
      notice={notice}
      setNotice={setNotice}
      onSaved={() => void mutate()}
    />
  );
}

type Notice = { ok: boolean; text: string } | null;

function DataProtectionView({
  data,
  notice,
  setNotice,
  onSaved,
}: {
  data: DataProtectionStatus;
  notice: Notice;
  setNotice: (n: Notice) => void;
  onSaved: () => void;
}) {
  const { me } = useAdminMe();
  const canManage = !!me?.permissions.includes("security.crypto.manage");
  const [form, setForm] = useState({
    sessionBinding: data.session.bindingEnabled,
    adminIpBinding: data.session.adminIpBinding,
    adminIpAllowlist: data.session.ipAllowlist,
    adminAllowedHours: data.session.allowedHours,
    antivirusMode: data.antivirus.mode,
    maxImagePixels: String(data.uploads.maxImagePixels),
    dualControlThresholdRial: data.dualControl.thresholdRial,
  });
  const [saving, setSaving] = useState(false);

  const s = data.session;
  const av = data.antivirus;
  const avTone = av.mode === "off" || !av.configured ? "bad" : av.reachable ? "ok" : "bad";
  const avLabel =
    av.mode === "off" ? "خاموش" : !av.configured ? "پیکربندی نشده" : av.reachable ? "فعال" : "در دسترس نیست";
  const openCircuits = data.resilience.circuits.filter((c) => c.state !== "CLOSED").length;

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      await axios.put("/api/admin/security/data-protection/settings", {
        sessionBinding: form.sessionBinding,
        adminIpBinding: form.adminIpBinding,
        adminIpAllowlist: form.adminIpAllowlist,
        adminAllowedHours: form.adminAllowedHours,
        antivirusMode: form.antivirusMode,
        maxImagePixels: Number(form.maxImagePixels),
        dualControlThresholdRial: Number(form.dualControlThresholdRial),
      });
      setNotice({ ok: true, text: "تنظیمات ذخیره شد" });
      onSaved();
    } catch (err) {
      setNotice({ ok: false, text: getErrorMessage(err, "ذخیره‌ی تنظیمات ناموفق بود") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {notice && (
        <div className={`p-3 rounded-xl text-[12px] font-bold ${notice.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
          {notice.text}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="پویش ضدبدافزار" value={avLabel} tone={avTone} />
        <StatTile label="نشست‌های خاتمه‌یافته (تغییر دستگاه/شبکه، ۷ روز)" value={fa(s.events7d.userTerminated + s.events7d.adminTerminated)} tone="ok" />
        <StatTile label="فایل‌های ردشده (۷ روز)" value={fa(data.uploads.rejected7d)} tone={data.antivirus.malware7d ? "bad" : "ok"} />
        <StatTile label="قطع‌کننده‌های باز" value={fa(openCircuits)} tone={openCircuits ? "warn" : "ok"} />
      </div>

      {!s.contextAvailable && (
        <div className="p-3 rounded-xl text-[12px] font-bold" style={{ background: WARN.bg, color: WARN.color }}>
          INTERNAL_PROXY_SECRET تنظیم نشده است؛ API آدرس IP و مرورگر واقعی کاربران را نمی‌بیند و کنترل تطبیقی نشست و فهرست IP مجاز اعمال نمی‌شود.
        </div>
      )}

      <Card
        icon={Activity}
        title="کنترل تطبیقی نشست و دسترسی پنل"
        subtitle="FDP_ACC_EXT.2.4 / 3.4 — مشخصات هر درخواست با نشست مقایسه می‌شود؛ تغییر مشکوک → ورود مجدد"
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-gray-50">
            <div>
              <p className="text-[12px] font-bold text-gray-800">تغییر مرورگر/دستگاه → خاتمه‌ی نشست</p>
              <p className="text-[11px] text-gray-400">برای کاربران و ادمین‌ها (به‌روزرسانی نسخه‌ی مرورگر تغییر شمرده نمی‌شود)</p>
            </div>
            <Toggle checked={form.sessionBinding} disabled={!canManage} onChange={(v) => setForm({ ...form, sessionBinding: v })} />
          </div>
          <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-gray-50">
            <div>
              <p className="text-[12px] font-bold text-gray-800">تغییر شبکه‌ی ادمین → ورود مجدد</p>
              <p className="text-[11px] text-gray-400">کاربران عادی فقط ثبت می‌شوند (IP موبایل مدام عوض می‌شود)</p>
            </div>
            <Toggle checked={form.adminIpBinding} disabled={!canManage} onChange={(v) => setForm({ ...form, adminIpBinding: v })} />
          </div>
          <Field label="IP/شبکه‌های مجاز پنل مدیریت (کارشناسان)" hint="جدا با ویرگول، مثلاً 185.1.2.0/24, 2.3.4.5 — خالی = بدون محدودیت. نمایندگان فروش مشمول نیستند.">
            <textarea
              dir="ltr"
              rows={2}
              className={inputCls}
              disabled={!canManage}
              value={form.adminIpAllowlist}
              onChange={(e) => setForm({ ...form, adminIpAllowlist: e.target.value })}
            />
          </Field>
          <Field label="ساعات مجاز کار با پنل (وقت تهران)" hint="مثلاً 07:00-23:00 — خالی = بدون محدودیت">
            <input
              dir="ltr"
              className={inputCls}
              disabled={!canManage}
              placeholder="07:00-23:00"
              value={form.adminAllowedHours}
              onChange={(e) => setForm({ ...form, adminAllowedHours: e.target.value })}
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2 mt-3 text-[11px]">
          <Badge {...OK}>خاتمه‌ی نشست کاربران: {fa(s.events7d.userTerminated)}</Badge>
          <Badge {...OK}>خاتمه‌ی نشست ادمین: {fa(s.events7d.adminTerminated)}</Badge>
          <Badge {...OK}>تغییر شبکه‌ی کاربران (ثبت‌شده): {fa(s.events7d.networkChanged)}</Badge>
          <Badge {...(s.events7d.loginDenied ? WARN : OK)}>ورود ردشده (شبکه/ساعت): {fa(s.events7d.loginDenied)}</Badge>
          {s.allowlistInvalid.length > 0 && <Badge {...BAD}>مقادیر نامعتبر: {s.allowlistInvalid.join("، ")}</Badge>}
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card icon={Users} title="تفکیک وظایف برداشت" subtitle="FPT_ITT_EXT.1.7 — برداشت بالای سقف را تأییدکننده نمی‌تواند خودش پرداخت کند">
          <Field label="سقف تأیید دونفره (ریال)" hint="۰ = همه‌ی برداشت‌ها نیازمند دو کارشناس مستقل">
            <input
              dir="ltr"
              inputMode="numeric"
              className={inputCls}
              disabled={!canManage}
              value={form.dualControlThresholdRial}
              onChange={(e) => setForm({ ...form, dualControlThresholdRial: e.target.value.replace(/\D/g, "") })}
            />
          </Field>
          <p className="text-[11px] text-gray-500 mt-2">
            برداشت‌های تأییدشده‌ی بالای سقف در انتظار پرداخت: <b>{fa(data.dualControl.pendingAboveThreshold)}</b>
          </p>
        </Card>

        <Card icon={Lock} title="دسترسی و داده‌ی حساس" subtitle="FDP_ACC_EXT.2.1 / 1.5 / FDP_RIP_EXT.1.3">
          <ul className="space-y-1.5 text-[12px] text-gray-700">
            <li className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" /> رد پیش‌فرض: مسیر بدون دسترسی اعلام‌شده برای هیچ ادمینی باز نیست
            </li>
            <li className="flex items-center gap-2">
              <EyeOff className="w-4 h-4 text-emerald-600" /> کد ملی و تاریخ تولد پوشانده؛ نمایش فقط با «نمایش» و ثبت در ممیزی
            </li>
            <li className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" /> فیلدهای داخلی (هش رمز، راز TOTP، هش توکن‌ها) از همه‌ی پاسخ‌ها حذف می‌شوند
            </li>
          </ul>
          <div className="flex flex-wrap gap-2 mt-3 text-[11px]">
            <Badge {...(data.rbac.undeclared7d ? BAD : OK)}>مسیر بدون دسترسی اعلام‌شده: {fa(data.rbac.undeclared7d)}</Badge>
            <Badge {...OK}>رد دسترسی (۷ روز): {fa(data.rbac.denied7d)}</Badge>
            <Badge {...OK}>نمایش کد ملی — کاربر: {fa(data.masking.reveals7d.users)} / کارشناس: {fa(data.masking.reveals7d.admins)}</Badge>
          </div>
        </Card>
      </div>

      <Card
        icon={FileWarning}
        title="امنیت فایل‌های بارگذاری‌شده"
        subtitle="FPT_RVM_EXT — بایت جادویی، ضدبدافزار، ابعاد تصویر، حذف فراداده، بازرسی آرشیو، نام‌گذاری سرور"
      >
        <div className="grid sm:grid-cols-3 gap-4 mb-4">
          <Field label="حالت پویش ضدبدافزار (ClamAV)" hint="خودکار: با تنظیم CLAMAV_HOST اجباری و fail-closed">
            <select
              className={inputCls}
              disabled={!canManage}
              value={form.antivirusMode}
              onChange={(e) => setForm({ ...form, antivirusMode: e.target.value as typeof form.antivirusMode })}
            >
              {(["auto", "required", "off"] as const).map((m) => (
                <option key={m} value={m}>
                  {AV_MODE_FA[m]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="بیشینه‌ی پیکسل تصویر" hint="عرض × ارتفاع، پیش از پردازش (pixel flood)">
            <input
              dir="ltr"
              inputMode="numeric"
              className={inputCls}
              disabled={!canManage}
              value={form.maxImagePixels}
              onChange={(e) => setForm({ ...form, maxImagePixels: e.target.value.replace(/\D/g, "") })}
            />
          </Field>
          <div className="text-[12px] space-y-1 p-3 rounded-xl bg-gray-50">
            <p>
              وضعیت پویشگر: <Badge {...(avTone === "ok" ? OK : BAD)}>{avLabel}</Badge>
            </p>
            {av.version && (
              <p className="text-[11px] text-gray-500">
                نسخه: <Tech>{av.version}</Tech>
              </p>
            )}
            <p className="text-[11px] text-gray-500">بدافزار شناسایی‌شده (۷ روز): {fa(av.malware7d)}</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full admin-table">
            <thead>
              <tr>
                <th>بخش</th>
                <th>پسوندهای مجاز</th>
                <th>حجم</th>
                <th>آرشیو</th>
              </tr>
            </thead>
            <tbody>
              {data.uploads.policies.map((p) => (
                <tr key={p.purpose}>
                  <td className="font-bold">{PURPOSE_FA[p.purpose] ?? p.purpose}</td>
                  <td dir="ltr" className="text-left">
                    <Tech>{p.allowedExtensions.join(", ")}</Tech>
                  </td>
                  <td>{mb(p.maxBytes)}</td>
                  <td className="text-[11px]">
                    {p.archiveLimits
                      ? `حداکثر ${fa(p.archiveLimits.maxEntries)} فایل، ${mb(p.archiveLimits.maxTotalUncompressed)} پس از بازگشایی، نسبت ${fa(p.archiveLimits.maxCompressionRatio)}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {Object.keys(data.uploads.rejectedByReason).length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3 text-[11px]">
            {Object.entries(data.uploads.rejectedByReason).map(([k, v]) => (
              <Badge key={k} {...(k === "MALWARE_DETECTED" ? BAD : WARN)}>
                {REASON_FA[k] ?? k}: {fa(v)}
              </Badge>
            ))}
          </div>
        )}
      </Card>

      <Card icon={Globe} title="پایداری در برابر خرابی سرویس‌های بیرونی" subtitle="FPT_FLS_EXT.1.2 — سقف زمانی + قطع‌کننده؛ هیچ خطایی به موفقیت تبدیل نمی‌شود">
        {data.resilience.circuits.length === 0 ? (
          <p className="text-[12px] text-gray-400">هنوز فراخوانی‌ای از پشت قطع‌کننده انجام نشده است</p>
        ) : (
          <div className="flex flex-wrap gap-2 text-[12px]">
            {data.resilience.circuits.map((c) => (
              <Badge key={c.name} {...(c.state === "CLOSED" ? OK : c.state === "OPEN" ? BAD : WARN)}>
                {CIRCUIT_FA[c.name] ?? c.name}: {c.state === "CLOSED" ? "عادی" : c.state === "OPEN" ? "قطع (موقت)" : "آزمایشی"}
              </Badge>
            ))}
          </div>
        )}
      </Card>

      {canManage && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[12px] font-bold text-white disabled:opacity-60"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            ذخیره‌ی تنظیمات
          </button>
        </div>
      )}
    </div>
  );
}
