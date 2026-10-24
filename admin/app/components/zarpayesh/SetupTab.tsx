// admin/app/components/zarpayesh/SetupTab.tsx
//
// وضعیت و راه‌اندازی: پیش‌شرط‌ها، اعتبارنامه‌ها، تنظیمات، آزمون اتصال مرحله‌به‌مرحله و کلید روشن/خاموش
"use client";
import { useState } from "react";
import useSWR from "swr";
import { CheckCircle2, KeyRound, PlugZap, Power, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import {
  ActionButton,
  Alert,
  Field,
  Kpi,
  api,
  faDateTime,
  fetcher,
  inputCls,
  useAction,
  usePerm,
} from "@/app/components/finance/ui";
import { API, Overview, PAY_TYPE_FA, Section, TestStep, useOverview } from "./shared";

interface TypeItem {
  id: string | number;
  title: string;
  fkMeasurementsName?: string;
  fkParentName?: string;
}
interface VaultItem {
  id: string | number;
  fkVault: string | number;
  fkVaultName?: string;
  fkTypeName?: string;
  balance?: number;
  allowedTradeAmount?: number;
  fkMeasurementsName?: string;
}

const CRED_LABEL: Record<string, { label: string; hint: string; secret: boolean }> = {
  ACCOUNT: { label: "نام کاربری سکو (account)", hint: "نام کاربری که زر پایش برای آرکان گلد صادر کرده است", secret: false },
  PASSWORD: { label: "رمز عبور (password)", hint: "رمز عبور متد Login", secret: true },
  AES_KEY: {
    label: "کلید AES-128-GCM (Hex)",
    hint: "کلید ۱۶ بایتی به صورت ۳۲ کاراکتر Hex برای رمز کردن کد ملی و موبایل",
    secret: true,
  },
};

export default function SetupTab() {
  const can = usePerm();
  const { data, mutate } = useOverview();
  if (!data) return null;
  const canManage = can("zarpayesh.manage");
  const canCreds = can("integrations.credentials.manage");
  return (
    <div className="space-y-4">
      <StatusCard data={data} canManage={canManage} onChange={() => mutate()} />
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Kpi title="معاملات تأییدشده" value={(data.stats.trades.APPROVED ?? 0).toLocaleString("fa-IR")} />
        <Kpi
          title="نیازمند بررسی"
          value={data.stats.needsReview.toLocaleString("fa-IR")}
          color={data.stats.needsReview ? "#dc2626" : undefined}
        />
        <Kpi title="کاربران ثبت‌شده" value={(data.stats.users.REGISTERED ?? 0).toLocaleString("fa-IR")} />
        <Kpi
          title="فراخوانی‌های ۲۴ ساعت"
          value={data.stats.calls24h.toLocaleString("fa-IR")}
          hint={`${data.stats.failed24h.toLocaleString("fa-IR")} ناموفق`}
        />
      </div>
      <CredentialsCard data={data} canEdit={canCreds} onChange={() => mutate()} />
      <ConnectionTestCard data={data} canManage={canManage} onChange={() => mutate()} />
      <SettingsCard data={data} canManage={canManage} onChange={() => mutate()} />
    </div>
  );
}

function StatusCard({ data, canManage, onChange }: { data: Overview; canManage: boolean; onChange: () => void }) {
  const a = useAction();
  const on = data.config.enabled;
  const toggle = async (enabled: boolean) => {
    const ok = await a.run(
      () => api.post(`${API}/toggle`, { enabled }),
      enabled
        ? "با روشن کردن، همه‌ی خرید و فروش‌های طلای آب‌شده‌ی کاربران پیش از قطعی شدن در سامانه ناظر ثبت می‌شوند و در صورت رد سامانه ناظر، معامله انجام نمی‌شود. ادامه می‌دهید؟"
        : "با خاموش کردن، معاملات دیگر به سامانه ناظر گزارش نمی‌شوند. ادامه می‌دهید؟",
    );
    if (ok) onChange();
  };
  return (
    <section
      className={`rounded-2xl p-4 sm:p-5 space-y-3 border-2 ${on ? "border-green-200 bg-green-50/40" : "border-amber-200 bg-amber-50/40"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Power className={`w-8 h-8 shrink-0 ${on ? "text-green-600" : "text-amber-600"}`} />
          <div>
            <p className="text-[15px] font-black text-gray-900">
              ثبت خودکار معاملات در سامانه ناظر: {on ? "روشن" : "خاموش"}
            </p>
            <p className="text-[12px] text-gray-500 mt-1 max-w-2xl">
              {on
                ? `از ${faDateTime(data.config.enabledAt)} هر خرید/فروش طلای آب‌شده ابتدا در سامانه ناظر رزرو و پس از ثبت داخلی تأیید (Approve) می‌شود.`
                : "پیش‌فرض خاموش است. پس از ثبت اعتبارنامه‌ها، انتخاب نوع فلز و خزانه و آزمون موفق اتصال، می‌توانید آن را روشن کنید."}
            </p>
          </div>
        </div>
        {canManage &&
          (on ? (
            <ActionButton variant="danger" busy={a.busy} onClick={() => toggle(false)}>
              خاموش کردن
            </ActionButton>
          ) : (
            <ActionButton busy={a.busy} disabled={!data.ready} onClick={() => toggle(true)}>
              روشن کردن ثبت خودکار
            </ActionButton>
          ))}
      </div>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {data.readiness.map((c) => (
          <li key={c.key} className="flex items-center gap-2 text-[12px] font-bold">
            {c.ok ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-red-500" />}
            <span className={c.ok ? "text-gray-700" : "text-red-600"}>{c.label}</span>
          </li>
        ))}
      </ul>
      {data.stats.verifiedMissingBirthDate > 0 && (
        <Alert
          kind="warn"
          text={`${data.stats.verifiedMissingBirthDate.toLocaleString("fa-IR")} کاربر احرازشده تاریخ تولد ثبت‌شده ندارند. تاریخ تولد برای ثبت کاربر در سامانه ناظر (AddPlatformUsers) اجباری است؛ پس از روشن کردن، این کاربران تا تکمیل تاریخ تولد نمی‌توانند طلای آب‌شده معامله کنند.`}
        />
      )}
      {a.error && <Alert kind="error" text={a.error} />}
      {a.success && <Alert kind="success" text={a.success} />}
    </section>
  );
}

function CredentialsCard({ data, canEdit, onChange }: { data: Overview; canEdit: boolean; onChange: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const a = useAction();
  const save = async (key: string) => {
    const ok = await a.run(() => api.post(`${API}/credentials`, { key, value: values[key] ?? "" }));
    if (ok) {
      setValues((v) => ({ ...v, [key]: "" }));
      onChange();
    }
  };
  return (
    <Section title="۱) اعتبارنامه‌های سکو (رمزشده نگهداری می‌شوند)">
      <div className="grid gap-3 md:grid-cols-3">
        {data.credentials.map((c) => {
          const meta = CRED_LABEL[c.key];
          return (
            <div key={c.key} className="space-y-2">
              <Field label={meta.label} hint={meta.hint}>
                <div className="flex gap-2 mt-1">
                  <input
                    type={meta.secret ? "password" : "text"}
                    dir="ltr"
                    autoComplete="off"
                    value={values[c.key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [c.key]: e.target.value }))}
                    placeholder={c.isSet ? (c.maskedValue ?? "ثبت شده") : "ثبت نشده"}
                    className={inputCls}
                    disabled={!canEdit}
                  />
                  {canEdit && (
                    <ActionButton variant="secondary" busy={a.busy} disabled={!values[c.key]} onClick={() => save(c.key)}>
                      ذخیره
                    </ActionButton>
                  )}
                </div>
              </Field>
              <p className="text-[11px] text-gray-400 flex items-center gap-1">
                <KeyRound className="w-3 h-3" />
                {c.isSet ? `ثبت‌شده — ${faDateTime(c.updatedAt)}${c.rotationDue ? " (زمان تعویض)" : ""}` : "هنوز ثبت نشده"}
              </p>
            </div>
          );
        })}
      </div>
      {!canEdit && <Alert kind="info" text="ثبت اعتبارنامه نیازمند دسترسی «مدیریت Credential های Provider» است." />}
      {a.error && <Alert kind="error" text={a.error} />}
      {a.success && <Alert kind="success" text={a.success} />}
    </Section>
  );
}

function ConnectionTestCard({ data, canManage, onChange }: { data: Overview; canManage: boolean; onChange: () => void }) {
  const [result, setResult] = useState<{ ok: boolean; message: string; steps: TestStep[] } | null>(null);
  const a = useAction();
  const s = useAction();
  const steps = result?.steps ?? data.config.lastTestResult?.steps ?? [];
  const run = async () => {
    await a.run(async () => {
      const res = await api.post(`${API}/test-connection`);
      setResult(res.data);
      onChange();
      return res;
    });
  };
  const session = async (action: "login" | "refresh" | "logout") => {
    await s.run(() => api.post(`${API}/session/${action}`));
    onChange();
  };
  return (
    <Section
      title="۲) آزمون اتصال مرحله‌به‌مرحله"
      actions={
        canManage && (
          <ActionButton busy={a.busy} onClick={run}>
            <PlugZap className="w-4 h-4" /> اجرای آزمون کامل
          </ActionButton>
        )
      }
    >
      <p className="text-[12px] text-gray-500">
        اعتبارنامه‌ها ← رفت‌وبرگشت رمزنگاری AES-128-GCM ← Login ← Refresh Token ← Typelist ← Vaultlist ← PayTypelist ← states.
        آخرین آزمون: {faDateTime(data.config.lastTestAt)}
        {data.config.connectionVerifiedAt && ` — آخرین آزمون موفق: ${faDateTime(data.config.connectionVerifiedAt)}`}
      </p>
      {steps.length > 0 && (
        <ol className="space-y-1.5">
          {steps.map((st, i) => (
            <li key={i} className="flex items-start gap-2 text-[12px]">
              {st.ok ? (
                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <span className="font-bold text-gray-800">{st.step}</span>
                <span className="text-gray-400"> · {st.durationMs.toLocaleString("fa-IR")} ms</span>
                {st.detail && <p className="text-gray-500">{st.detail}</p>}
                {st.error && <p className="text-red-600 font-bold">{st.error}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
      {a.error && <Alert kind="error" text={a.error} />}
      {result && <Alert kind={result.ok ? "success" : "warn"} text={result.message} />}

      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
        <span className="text-[12px] font-bold text-gray-600 flex items-center gap-1">
          <ShieldCheck className="w-4 h-4" />
          نشست: {data.session.active ? (data.session.tokenValid ? "فعال" : "توکن منقضی — تمدید خودکار") : "بدون نشست"}
          {data.session.expire && <span className="text-gray-400 font-normal"> · انقضا {faDateTime(data.session.expire)}</span>}
        </span>
        {canManage && (
          <>
            <ActionButton variant="secondary" busy={s.busy} onClick={() => session("login")}>
              Login
            </ActionButton>
            <ActionButton variant="secondary" busy={s.busy} onClick={() => session("refresh")}>
              <RefreshCw className="w-4 h-4" /> Refresh Token
            </ActionButton>
            <ActionButton variant="secondary" busy={s.busy} onClick={() => session("logout")}>
              Logout
            </ActionButton>
          </>
        )}
      </div>
      {s.error && <Alert kind="error" text={s.error} />}
      {s.success && <Alert kind="success" text={s.success} />}
      {canManage && <CryptoTester />}
    </Section>
  );
}

function CryptoTester() {
  const [value, setValue] = useState("");
  const [out, setOut] = useState("");
  const a = useAction();
  const call = (kind: "encrypt" | "decrypt") =>
    a.run(async () => {
      const res = await api.post(`${API}/crypto/${kind}`, { value });
      const d = res.data as { cipherText?: string; message?: string; plainMasked?: string };
      setOut(d.cipherText ?? `${d.message ?? ""}${d.plainMasked ? ` → ${d.plainMasked}` : ""}`);
      return { data: { message: "انجام شد" } };
    });
  return (
    <div className="pt-2 border-t border-gray-100 space-y-2">
      <p className="text-[12px] font-bold text-gray-600">
        آزمون رمزنگاری کد ملی/موبایل — برای تطبیق با نمونه‌ی رمزشده‌ای که زر پایش با کلید اختصاصی آرکان گلد ارائه می‌کند
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          dir="ltr"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="متن ساده (مثلاً 09121234567) یا متن رمزشده (Base64)"
          className={`${inputCls} flex-1 min-w-60`}
        />
        <ActionButton variant="secondary" busy={a.busy} disabled={!value} onClick={() => call("encrypt")}>
          Encrypt
        </ActionButton>
        <ActionButton variant="secondary" busy={a.busy} disabled={!value} onClick={() => call("decrypt")}>
          Decrypt
        </ActionButton>
      </div>
      {out && (
        <p dir="ltr" className="text-[11px] break-all bg-gray-50 rounded-lg p-2 font-mono">
          {out}
        </p>
      )}
      {a.error && <Alert kind="error" text={a.error} />}
    </div>
  );
}

function SettingsCard({ data, canManage, onChange }: { data: Overview; canManage: boolean; onChange: () => void }) {
  const c = data.config;
  const [form, setForm] = useState({
    baseUrl: c.baseUrl,
    timeoutMs: String(c.timeoutMs),
    typeId: c.typeId ?? "",
    typeTitle: c.typeTitle ?? "",
    vaultId: c.vaultId ?? "",
    vaultTitle: c.vaultTitle ?? "",
    buyPayType: String(c.buyPayType),
    sellPayType: String(c.sellPayType),
    unitPriceBasis: c.unitPriceBasis,
    autoRegisterUsers: c.autoRegisterUsers,
  });
  const connected = !!c.connectionVerifiedAt;
  const types = useSWR<TypeItem[]>(connected ? `${API}/lookup/types` : null, fetcher);
  const vaults = useSWR<VaultItem[]>(connected ? `${API}/lookup/vaults` : null, fetcher);
  const a = useAction();
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const save = async () => {
    const ok = await a.run(() =>
      api.patch(`${API}/settings`, {
        baseUrl: form.baseUrl.trim(),
        timeoutMs: Number(form.timeoutMs),
        ...(form.typeId ? { typeId: String(form.typeId), typeTitle: form.typeTitle || undefined } : {}),
        ...(form.vaultId ? { vaultId: String(form.vaultId), vaultTitle: form.vaultTitle || undefined } : {}),
        buyPayType: Number(form.buyPayType),
        sellPayType: Number(form.sellPayType),
        unitPriceBasis: form.unitPriceBasis,
        autoRegisterUsers: form.autoRegisterUsers,
      }),
    );
    if (ok) onChange();
  };
  return (
    <Section
      title="۳) تنظیمات اتصال و معامله"
      actions={
        canManage && (
          <ActionButton busy={a.busy} onClick={save}>
            ذخیره تنظیمات
          </ActionButton>
        )
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="آدرس سرور (Host)" hint="مستند: http://api.rpmms.ir — مسیرها با /api شروع می‌شوند">
          <input dir="ltr" className={inputCls} value={form.baseUrl} onChange={(e) => set("baseUrl", e.target.value)} disabled={!canManage} />
        </Field>
        <Field label="حداکثر زمان انتظار هر درخواست (میلی‌ثانیه)" hint="بین ۳۰۰۰ تا ۶۰۰۰۰ — Approve داخل تراکنش حداکثر ۱۰ ثانیه منتظر می‌ماند">
          <input dir="ltr" type="number" className={inputCls} value={form.timeoutMs} onChange={(e) => set("timeoutMs", e.target.value)} disabled={!canManage} />
        </Field>
        <Field label="نوع فلز (typeId — متد Typelist)">
          {types.data?.length ? (
            <select
              className={inputCls}
              value={String(form.typeId)}
              disabled={!canManage}
              onChange={(e) => {
                const t = types.data?.find((x) => String(x.id) === e.target.value);
                setForm((f) => ({ ...f, typeId: e.target.value, typeTitle: t ? `${t.title}${t.fkMeasurementsName ? ` (${t.fkMeasurementsName})` : ""}` : "" }));
              }}
            >
              <option value="">انتخاب کنید</option>
              {types.data.map((t) => (
                <option key={String(t.id)} value={String(t.id)}>
                  {t.id} — {t.title} {t.fkParentName ? `/ ${t.fkParentName}` : ""} {t.fkMeasurementsName ? `(${t.fkMeasurementsName})` : ""}
                </option>
              ))}
            </select>
          ) : (
            <input dir="ltr" className={inputCls} value={form.typeId} onChange={(e) => set("typeId", e.target.value)} disabled={!canManage} placeholder="پس از آزمون موفق اتصال فهرست نمایش داده می‌شود" />
          )}
        </Field>
        <Field label="خزانه (vaultId — فیلد fkVault متد Vaultlist)">
          {vaults.data?.length ? (
            <select
              className={inputCls}
              value={String(form.vaultId)}
              disabled={!canManage}
              onChange={(e) => {
                const v = vaults.data?.find((x) => String(x.fkVault) === e.target.value);
                setForm((f) => ({ ...f, vaultId: e.target.value, vaultTitle: v ? `${v.fkVaultName ?? ""} — ${v.fkTypeName ?? ""}` : "" }));
              }}
            >
              <option value="">انتخاب کنید</option>
              {vaults.data.map((v) => (
                <option key={String(v.id)} value={String(v.fkVault)}>
                  {v.fkVault} — {v.fkVaultName} / {v.fkTypeName} · موجودی {Number(v.balance ?? 0).toLocaleString("fa-IR")} · قابل معامله{" "}
                  {Number(v.allowedTradeAmount ?? 0).toLocaleString("fa-IR")} {v.fkMeasurementsName ?? ""}
                </option>
              ))}
            </select>
          ) : (
            <input dir="ltr" className={inputCls} value={form.vaultId} onChange={(e) => set("vaultId", e.target.value)} disabled={!canManage} placeholder="پس از آزمون موفق اتصال فهرست نمایش داده می‌شود" />
          )}
        </Field>
        <Field label="ابزار پرداخت خرید کاربر (payType)">
          <select className={inputCls} value={form.buyPayType} onChange={(e) => set("buyPayType", e.target.value)} disabled={!canManage}>
            {Object.entries(PAY_TYPE_FA).map(([k, v]) => (
              <option key={k} value={k}>
                {k} — {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="ابزار پرداخت فروش کاربر (payType)">
          <select className={inputCls} value={form.sellPayType} onChange={(e) => set("sellPayType", e.target.value)} disabled={!canManage}>
            {Object.entries(PAY_TYPE_FA).map(([k, v]) => (
              <option key={k} value={k}>
                {k} — {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="مبنای قیمت واحد (unitPrice)" hint="amount همیشه به میلی‌گرم است؛ این گزینه را با کارشناس زر پایش تأیید کنید">
          <select className={inputCls} value={form.unitPriceBasis} onChange={(e) => set("unitPriceBasis", e.target.value)} disabled={!canManage}>
            <option value="GRAM">ریال به ازای هر گرم</option>
            <option value="MILLIGRAM">ریال به ازای هر میلی‌گرم</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 text-[12px] font-bold text-gray-700 mt-6">
          <input type="checkbox" checked={form.autoRegisterUsers} onChange={(e) => set("autoRegisterUsers", e.target.checked)} disabled={!canManage} />
          ثبت خودکار کاربر در سامانه ناظر (AddPlatformUsers) پیش از اولین معامله
        </label>
      </div>
      {a.error && <Alert kind="error" text={a.error} />}
      {a.success && <Alert kind="success" text={a.success} />}
    </Section>
  );
}
