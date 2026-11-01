// admin/app/(dashboard)/security/SessionCommSection.tsx
// بخش «نشست و ارتباطات» پنل امنیت (کلاس‌های FTA، FTP و FMT):
// زمان‌های نشست، نشست‌های فعال، خروج اضطراری دونفره، تأیید ثانویه، توکن‌ها و امنیت ارتباط سرویس‌ها.
// هیچ راز، کلید یا توکنی در این بخش نمایش داده نمی‌شود.
"use client";
import { useState } from "react";
import useSWR from "swr";
import axios from "axios";
import { Fingerprint, Loader2, LogOut, Network, Save, Timer, Users } from "lucide-react";
import { useAdminMe } from "@/app/hooks/useAdminMe";
import { adminStepUpHeaders } from "@/app/utils/step-up";
import { BAD, Badge, Card, OK, StatTile, Tech, WARN, fa, fetcher, getErrorMessage } from "./ui";

type Scope = "users" | "admins" | "all";

interface SessionCommStatus {
  sessionPolicy: {
    user: { idleMinutes: number; absoluteHours: number };
    admin: { idleMinutes: number; absoluteHours: number };
  };
  activeSessions: { users: number; admins: number };
  emergency: {
    pending: {
      id: string;
      scope: Scope;
      scopeLabel: string;
      reason: string;
      requestedBy: string;
      requestedByName: string;
      requestedAt: string;
    } | null;
    last: { createdAt: string; newValue: { scope?: Scope; revoked?: { users: number; admins: number } } | null } | null;
  };
  stepUp: {
    userActions: string[];
    adminActions: string[];
    last7d: { userVerified: number; userFailed: number; adminFailed: number };
  };
  tokens: { algorithm: string; issuer: string; audiences: Record<string, string>; cookiePrefix: string };
  serviceAuth: { bffSigning: boolean; scheme: string; maxSkewSeconds: number };
  transport: {
    databaseTls: boolean;
    databaseCertVerified: boolean;
    redisTls: boolean;
    clamavConfigured: boolean;
    zarpayesh: { https: boolean; insecureAllowed: boolean } | null;
  };
}

const SCOPE_OPTIONS: { value: Scope; label: string }[] = [
  { value: "users", label: "همه‌ی کاربران" },
  { value: "admins", label: "همه‌ی ادمین‌ها و نمایندگان (به‌جز شما)" },
  { value: "all", label: "همه‌ی کاربران و ادمین‌ها" },
];

const inputCls =
  "w-full px-3 py-2 rounded-xl border border-gray-200 text-[12px] focus:outline-none focus:border-emerald-400 disabled:bg-gray-50";

const dt = (s: string) => new Date(s).toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" });

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-0">
      <span className="text-[12px] text-gray-600">{label}</span>
      <span className="text-[12px] font-bold text-gray-900 text-left">{children}</span>
    </div>
  );
}

function Flag({ ok, yes, no, warn }: { ok: boolean; yes: string; no: string; warn?: boolean }) {
  const tone = ok ? OK : warn ? WARN : BAD;
  return (
    <Badge bg={tone.bg} color={tone.color}>
      {ok ? yes : no}
    </Badge>
  );
}

type Notice = { ok: boolean; text: string } | null;

function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <p className={`text-[12px] font-bold mt-2 ${notice.ok ? "text-emerald-700" : "text-red-600"}`} role="status">
      {notice.text}
    </p>
  );
}

function PolicyForm({
  data,
  canManage,
  onSaved,
  notice,
  setNotice,
}: {
  data: SessionCommStatus;
  canManage: boolean;
  onSaved: () => void;
  notice: Notice;
  setNotice: (n: Notice) => void;
}) {
  const p = data.sessionPolicy;
  const [form, setForm] = useState({
    userIdleMinutes: String(p.user.idleMinutes),
    userAbsoluteHours: String(p.user.absoluteHours),
    adminIdleMinutes: String(p.admin.idleMinutes),
    adminAbsoluteHours: String(p.admin.absoluteHours),
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const headers = await adminStepUpHeaders("تغییر زمان‌های نشست");
      const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, Number(v)]));
      const { data: res } = await axios.put("/api/admin/security/session-comm/policy", body, { headers });
      setNotice({ ok: true, text: res?.message ?? "ذخیره شد" });
      onSaved();
    } catch (e) {
      setNotice({ ok: false, text: getErrorMessage(e, "ذخیره نشد") });
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof typeof form, label: string, hint: string, min: number, max: number) => (
    <label className="block space-y-1">
      <span className="text-[12px] font-bold text-gray-700">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        dir="ltr"
        className={inputCls}
        value={form[key]}
        disabled={!canManage}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      />
      <span className="block text-[11px] text-gray-400">{hint}</span>
    </label>
  );

  return (
    <Card
      icon={Timer}
      title="زمان‌های نشست"
      subtitle="پایان نشست پس از عدم فعالیت و انقضای مطلق از لحظه‌ی ورود؛ تمدید توکن، انقضای مطلق را جابه‌جا نمی‌کند"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {field("userIdleMinutes", "عدم فعالیت کاربر (دقیقه)", "پیش‌فرض ۱۵ — بازه‌ی ۵ تا ۱۴۴۰", 5, 1440)}
        {field("userAbsoluteHours", "انقضای مطلق نشست کاربر (ساعت)", "پیش‌فرض ۱۲ — بازه‌ی ۱ تا ۱۶۸", 1, 168)}
        {field("adminIdleMinutes", "عدم فعالیت پنل (دقیقه)", "پیش‌فرض ۳۰ — پس از آن صفحه قفل می‌شود", 5, 480)}
        {field("adminAbsoluteHours", "انقضای مطلق نشست پنل (ساعت)", "پیش‌فرض ۲۴ — بازه‌ی ۱ تا ۱۶۸", 1, 168)}
      </div>
      {canManage ? (
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          ذخیره (نیازمند کد برنامه‌ی احراز هویت)
        </button>
      ) : (
        <p className="mt-3 text-[11px] text-gray-400">برای تغییر، مجوز «مدیریت رمزنگاری و امنیت» لازم است.</p>
      )}
      <NoticeLine notice={notice} />
    </Card>
  );
}

function EmergencyCard({
  data,
  canEmergency,
  myId,
  onDone,
}: {
  data: SessionCommStatus;
  canEmergency: boolean;
  myId: string | undefined;
  onDone: () => void;
}) {
  const [scope, setScope] = useState<Scope>("users");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"request" | "approve" | "cancel" | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const pending = data.emergency.pending;
  const last = data.emergency.last;

  const run = async (kind: "request" | "approve" | "cancel") => {
    setBusy(kind);
    setNotice(null);
    try {
      const url = `/api/admin/security/sessions/emergency/${kind}`;
      let res;
      if (kind === "request") {
        const headers = await adminStepUpHeaders("درخواست خروج اضطراری");
        res = await axios.post(url, { scope, reason: reason.trim() }, { headers });
        setReason("");
      } else if (kind === "approve") {
        if (!pending) return;
        const headers = await adminStepUpHeaders("تأیید خروج اضطراری");
        res = await axios.post(url, { requestId: pending.id }, { headers });
      } else {
        if (!pending) return;
        res = await axios.post(url, { requestId: pending.id });
      }
      setNotice({ ok: true, text: res.data?.message ?? "انجام شد" });
      onDone();
    } catch (e) {
      setNotice({ ok: false, text: getErrorMessage(e, "انجام نشد") });
    } finally {
      setBusy(null);
    }
  };

  const btn = (kind: "request" | "approve" | "cancel", label: string, danger: boolean, disabled = false) => (
    <button
      type="button"
      onClick={() => run(kind)}
      disabled={busy !== null || disabled}
      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold disabled:opacity-60"
      style={
        danger
          ? { backgroundColor: "#dc2626", color: "#fff" }
          : { backgroundColor: "var(--color-bg-page)", color: "var(--color-text-secondary)" }
      }
    >
      {busy === kind ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
      {label}
    </button>
  );

  return (
    <Card
      icon={LogOut}
      title="خروج اضطراری همگانی"
      subtitle="بستن نشست همه‌ی کاربران یا ادمین‌ها با تأیید دونفره؛ درخواست ۱۵ دقیقه معتبر است و کارشناس دوم باید آن را تأیید کند"
    >
      {last && (
        <p className="text-[11px] text-gray-500 mb-3">
          آخرین اجرا: {dt(last.createdAt)}
          {last.newValue?.revoked &&
            ` — ${fa(last.newValue.revoked.users)} نشست کاربر و ${fa(last.newValue.revoked.admins)} نشست ادمین`}
        </p>
      )}
      {pending ? (
        <div className="rounded-xl p-3 space-y-2" style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca" }}>
          <p className="text-[12px] font-black text-red-700">در انتظار تأیید: خروج {pending.scopeLabel}</p>
          <p className="text-[12px] text-gray-700">دلیل: {pending.reason}</p>
          <p className="text-[11px] text-gray-500">
            درخواست‌دهنده: {pending.requestedByName} — {dt(pending.requestedAt)}
          </p>
          {canEmergency && (
            <div className="flex flex-wrap gap-2 pt-1">
              {pending.requestedBy === myId ? (
                <p className="text-[11px] text-gray-500 w-full">تأیید باید توسط کارشناس دیگری انجام شود.</p>
              ) : (
                btn("approve", "تأیید و اجرا", true)
              )}
              {btn("cancel", "لغو درخواست", false)}
            </div>
          )}
        </div>
      ) : canEmergency ? (
        <div className="space-y-2">
          <select className={inputCls} value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
            {SCOPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <textarea
            className={`${inputCls} min-h-[70px]`}
            placeholder="دلیل (مثلاً احتمال افشای کلید یا رخداد امنیتی) — حداقل ۱۰ کاراکتر"
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
          />
          {btn("request", "ثبت درخواست خروج اضطراری", true, reason.trim().length < 10)}
        </div>
      ) : (
        <p className="text-[11px] text-gray-400">برای این عملیات مجوز «خروج اضطراری نشست‌ها» لازم است.</p>
      )}
      <NoticeLine notice={notice} />
    </Card>
  );
}

export default function SessionCommSection() {
  const { me } = useAdminMe();
  // پیام ذخیره در والد نگه داشته می‌شود تا با مقداردهی دوباره‌ی فرم (پس از دریافت مقادیر تازه) از بین نرود
  const [policyNotice, setPolicyNotice] = useState<Notice>(null);
  const { data, isLoading, error, mutate } = useSWR<SessionCommStatus>("/api/admin/security/session-comm", fetcher, {
    revalidateOnFocus: false,
  });

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

  const perms = me?.permissions ?? [];
  const canManage = perms.includes("security.crypto.manage");
  const canEmergency = perms.includes("security.sessions.emergency");
  const t = data.transport;
  const s = data.stepUp.last7d;
  const policyKey = [
    data.sessionPolicy.user.idleMinutes,
    data.sessionPolicy.user.absoluteHours,
    data.sessionPolicy.admin.idleMinutes,
    data.sessionPolicy.admin.absoluteHours,
  ].join("|");

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatTile label="نشست‌های فعال کاربران" value={fa(data.activeSessions.users)} tone="ok" />
        <StatTile label="نشست‌های فعال پنل" value={fa(data.activeSessions.admins)} tone="ok" />
        <StatTile
          label="امضای درخواست‌های BFF"
          value={data.serviceAuth.bffSigning ? "فعال" : "پیکربندی نشده"}
          tone={data.serviceAuth.bffSigning ? "ok" : "bad"}
        />
        <StatTile
          label="تأیید ثانویه‌ی ناموفق (۷ روز)"
          value={fa(s.userFailed + s.adminFailed)}
          tone={s.userFailed + s.adminFailed > 20 ? "warn" : "ok"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PolicyForm
          key={policyKey}
          data={data}
          canManage={canManage}
          onSaved={() => void mutate()}
          notice={policyNotice}
          setNotice={setPolicyNotice}
        />
        <EmergencyCard data={data} canEmergency={canEmergency} myId={me?.id} onDone={() => void mutate()} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          icon={Fingerprint}
          title="تأیید ثانویه پیش از عملیات حساس"
          subtitle="کاربر: کد پیامکی یا برنامه‌ی احراز هویت — پنل: کد برنامه‌ی احراز هویت؛ هر تأیید فقط یک‌بار و برای همان عملیات معتبر است"
        >
          <p className="text-[12px] font-bold text-gray-700 mb-1">کاربران</p>
          <ul className="list-disc pr-5 text-[12px] text-gray-600 space-y-0.5 mb-3">
            {data.stepUp.userActions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          <p className="text-[12px] font-bold text-gray-700 mb-1">پنل مدیریت</p>
          <ul className="list-disc pr-5 text-[12px] text-gray-600 space-y-0.5 mb-3">
            {data.stepUp.adminActions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          <Row label="تأیید موفق کاربران (۷ روز)">{fa(s.userVerified)}</Row>
          <Row label="تأیید ناموفق کاربران (۷ روز)">{fa(s.userFailed)}</Row>
          <Row label="کد نادرست در پنل (۷ روز)">{fa(s.adminFailed)}</Row>
        </Card>

        <Card icon={Users} title="توکن‌ها و کوکی‌ها" subtitle="هر توکن فقط برای مخاطب (aud) خودش پذیرفته می‌شود">
          <Row label="الگوریتم امضا (فهرست مجاز)">
            <Tech>{data.tokens.algorithm}</Tech>
          </Row>
          <Row label="صادرکننده (iss)">
            <Tech>{data.tokens.issuer}</Tech>
          </Row>
          {Object.entries(data.tokens.audiences).map(([k, v]) => (
            <Row key={k} label={k}>
              <Tech>{v}</Tech>
            </Row>
          ))}
          <Row label="پیشوند کوکی نشست در محیط عملیاتی">
            <Tech>{data.tokens.cookiePrefix}</Tech>
          </Row>
        </Card>
      </div>

      <Card
        icon={Network}
        title="امنیت ارتباط سرویس‌ها"
        subtitle="احراز هویت متقابل BFF و API بدون ارسال کلید ثابت؛ رمزنگاری ارتباط با پایگاه داده، Redis و سرویس‌های بیرونی"
      >
        <Row label="BFF ← API">
          <span className="inline-flex items-center gap-2">
            <Flag ok={data.serviceAuth.bffSigning} yes="امضای HMAC فعال" no="INTERNAL_PROXY_SECRET تنظیم نشده" />
            <span className="text-[11px] text-gray-400 font-normal">
              {data.serviceAuth.scheme} — حداکثر اختلاف زمان {fa(data.serviceAuth.maxSkewSeconds)} ثانیه
            </span>
          </span>
        </Row>
        <Row label="پایگاه داده (PostgreSQL)">
          {t.databaseCertVerified ? (
            <Flag ok yes="TLS با بررسی گواهی (verify-full)" no="" />
          ) : (
            <Flag ok={false} warn={t.databaseTls} yes="" no={t.databaseTls ? "TLS بدون بررسی کامل گواهی" : "بدون TLS"} />
          )}
        </Row>
        <Row label="Redis">
          <Flag ok={t.redisTls} warn yes="TLS" no="بدون TLS (فقط در شبکه‌ی خصوصی مجاز است)" />
        </Row>
        <Row label="زرپایش">
          {t.zarpayesh === null ? (
            <span className="text-gray-400 font-normal">پیکربندی نشده</span>
          ) : t.zarpayesh.https ? (
            <Flag ok yes="HTTPS" no="" />
          ) : (
            <Flag
              ok={false}
              warn={t.zarpayesh.insecureAllowed}
              yes=""
              no={t.zarpayesh.insecureAllowed ? "HTTP با استثنای ممیزی‌شده" : "HTTP — اتصال مسدود است"}
            />
          )}
        </Row>
        <Row label="ضدبدافزار (ClamAV)">
          <Flag ok={t.clamavConfigured} warn yes="پیکربندی شده" no="پیکربندی نشده" />
        </Row>
      </Card>
    </div>
  );
}
