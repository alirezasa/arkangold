"use client";
import { useState } from "react";
import useSWR from "swr";
import { adminApi } from "@/app/core/api";
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Plug,
  KeyRound,
  ListChecks,
} from "lucide-react";

interface Provider {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

interface ProviderServiceLink {
  id: string;
  providerId: string;
  serviceId: string;
  isActive: boolean;
  priority: number;
  isFallback: boolean;
  provider: Provider;
}

interface ServiceItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  providers: ProviderServiceLink[];
}

interface CredentialItem {
  key: string;
  maskedValue: string;
  updatedAt: string;
  keyVersion: string;
  needsReencryption: boolean;
  rotationDue: boolean;
}

interface LogItem {
  id: string;
  status: string;
  httpStatus: number | null;
  errorCode: string | null;
  durationMs: number | null;
  createdAt: string;
  provider: Provider | null;
  service: { code: string; name: string } | null;
}

const fetcher = (url: string) => adminApi.get(url).then((r) => r.data);

const FINOTECH_CREDENTIAL_FIELDS: { key: string; label: string; secret: boolean }[] = [
  { key: "CLIENT_ID", label: "Client ID", secret: false },
  { key: "CLIENT_SECRET", label: "Client Secret", secret: true },
  { key: "NID", label: "کد ملی صاحب کلاینت (NID)", secret: false },
];

function Toggle({
  active,
  onClick,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold shrink-0"
      style={{
        background: active ? "#dcfce7" : "#f3f4f6",
        color: active ? "#16a34a" : "#6b7280",
      }}
    >
      {disabled ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <CheckCircle2 className="w-3.5 h-3.5" />
      )}
      {active ? "فعال" : "غیرفعال"}
    </button>
  );
}

function Card({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: typeof Plug;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-gray-500" />
          <h2 className="text-sm font-black text-gray-900">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export default function IntegrationsPage() {
  const {
    data: services,
    mutate: mutateServices,
    isLoading: servicesLoading,
    error: servicesError,
  } = useSWR<ServiceItem[]>("/api/admin/integrations/services", fetcher);

  const { data: providers, mutate: mutateProviders } = useSWR<Provider[]>(
    "/api/admin/integrations/providers",
    fetcher,
  );

  const { data: logs, mutate: mutateLogs } = useSWR<{ data: LogItem[] }>(
    "/api/admin/integrations/logs?limit=15",
    fetcher,
  );

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [credentialSaved, setCredentialSaved] = useState<string | null>(null);

  const runAction = async (key: string, fn: () => Promise<void>) => {
    setBusyKey(key);
    setPageError(null);
    try {
      await fn();
    } catch (e: unknown) {
      const message =
        (e as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "خطا در ذخیره تنظیمات";
      setPageError(message);
    } finally {
      setBusyKey(null);
    }
  };

  const toggleProvider = (code: string, current: boolean) =>
    runAction(`provider-${code}`, async () => {
      await adminApi.patch(`/api/admin/integrations/providers/${code}`, {
        isActive: !current,
      });
      await mutateProviders();
      await mutateServices();
    });

  const toggleService = (code: string, current: boolean) =>
    runAction(`service-${code}`, async () => {
      await adminApi.patch(`/api/admin/integrations/services/${code}`, {
        isActive: !current,
      });
      await mutateServices();
    });

  const updateLink = (
    providerCode: string,
    serviceCode: string,
    patch: { isActive?: boolean; priority?: number; isFallback?: boolean },
  ) =>
    runAction(`link-${providerCode}-${serviceCode}`, async () => {
      await adminApi.patch(
        `/api/admin/integrations/providers/${providerCode}/services/${serviceCode}`,
        patch,
      );
      await mutateServices();
    });

  const testFinotechConnection = () =>
    runAction("test-finotech", async () => {
      setTestResult(null);
      const res = await adminApi.post(
        "/api/admin/integrations/providers/finotech/test-connection",
      );
      setTestResult(res.data);
    });

  const finotechProvider = providers?.find((p) => p.code === "FINOTECH");

  if (servicesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (servicesError) {
    return (
      <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 text-red-600 text-[13px] font-bold">
        <AlertCircle className="w-4 h-4" />
        خطا در دریافت اطلاعات یکپارچه‌سازی‌ها
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-5" dir="rtl">
      <div>
        <h1 className="text-lg font-black text-gray-900">
          یکپارچه‌سازی‌ها (KYC / فینوتک)
        </h1>
        <p className="text-xs text-gray-400 mt-1">
          مدیریت Provider احراز هویت، اولویت/فال‌بک بین آن‌ها، Credential فینوتک و تست اتصال —
          بدون نیاز به تغییر کد یا Deploy مجدد.
        </p>
      </div>

      {pageError && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 text-red-600 text-[12px] font-bold">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {pageError}
        </div>
      )}

      {/* سرویس‌ها و اولویت Providerها */}
      {services?.map((service) => (
        <Card key={service.code} title={`${service.name} (${service.code})`} icon={ListChecks}>
          <div className="flex items-center justify-between mb-3 pb-3 border-b" style={{ borderColor: "var(--color-border)" }}>
            <span className="text-[12px] font-bold text-gray-500">
              وضعیت کلی سرویس
            </span>
            <Toggle
              active={service.isActive}
              disabled={busyKey === `service-${service.code}`}
              onClick={() => toggleService(service.code, service.isActive)}
            />
          </div>

          {service.providers.length === 0 ? (
            <p className="text-[12px] text-gray-400">
              هیچ Provider ای برای این سرویس تنظیم نشده است.
            </p>
          ) : (
            <div className="space-y-2">
              {service.providers.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ backgroundColor: "var(--color-background, #f9fafb)" }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-gray-800">
                      {link.provider.name}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {link.provider.code}
                      {link.isFallback ? " · فال‌بک" : " · Primary در این اولویت"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-gray-400">اولویت</label>
                    <input
                      type="number"
                      defaultValue={link.priority}
                      onBlur={(e) => {
                        const val = Number(e.target.value);
                        if (!Number.isNaN(val) && val !== link.priority) {
                          updateLink(link.provider.code, service.code, {
                            priority: val,
                          });
                        }
                      }}
                      className="w-14 px-2 py-1.5 rounded-lg border text-center text-[12px]"
                      style={{ borderColor: "var(--color-border)" }}
                    />
                  </div>

                  <button
                    onClick={() =>
                      updateLink(link.provider.code, service.code, {
                        isFallback: !link.isFallback,
                      })
                    }
                    disabled={busyKey === `link-${link.provider.code}-${service.code}`}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold"
                    style={{
                      background: link.isFallback ? "#fef9c3" : "#f3f4f6",
                      color: link.isFallback ? "#a16207" : "#6b7280",
                    }}
                  >
                    فال‌بک
                  </button>

                  <Toggle
                    active={link.isActive}
                    disabled={busyKey === `link-${link.provider.code}-${service.code}`}
                    onClick={() =>
                      updateLink(link.provider.code, service.code, {
                        isActive: !link.isActive,
                      })
                    }
                  />
                </div>
              ))}
              <p className="text-[10px] text-gray-400 pt-1">
                عدد اولویت کوچک‌تر یعنی اولویت بالاتر (اول امتحان می‌شود). اگر Providerِ
                اولویت‌دار با خطای فنی مواجه شود، سراغ اولویت بعدی می‌رود.
              </p>
            </div>
          )}
        </Card>
      ))}

      {/* Providerها و فعال/غیرفعال کلی */}
      <Card title="Providerها" icon={Plug}>
        <div className="space-y-2">
          {providers?.map((p) => (
            <div
              key={p.code}
              className="flex items-center justify-between p-3 rounded-xl"
              style={{ backgroundColor: "var(--color-background, #f9fafb)" }}
            >
              <div>
                <p className="text-[13px] font-bold text-gray-800">{p.name}</p>
                <p className="text-[10px] text-gray-400">{p.code}</p>
              </div>
              <Toggle
                active={p.isActive}
                disabled={busyKey === `provider-${p.code}`}
                onClick={() => toggleProvider(p.code, p.isActive)}
              />
            </div>
          ))}
        </div>
      </Card>

      {/* Credentialهای فینوتک */}
      {finotechProvider && (
        <Card title="Credential های فینوتک" icon={KeyRound}>
          <FinotechCredentials
            onSaved={(key) => {
              setCredentialSaved(key);
              setTimeout(() => setCredentialSaved((k) => (k === key ? null : k)), 1800);
            }}
          />
          {credentialSaved && (
            <p className="text-[11px] font-bold text-emerald-600 mt-2 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> {credentialSaved} ذخیره شد
            </p>
          )}

          <div className="mt-4 pt-4 border-t" style={{ borderColor: "var(--color-border)" }}>
            <button
              onClick={testFinotechConnection}
              disabled={busyKey === "test-finotech"}
              className="w-full py-2.5 rounded-xl font-bold text-white text-[13px] flex items-center justify-center gap-2"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              {busyKey === "test-finotech" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plug className="w-4 h-4" />
              )}
              تست اتصال فینوتک (گرفتن توکن)
            </button>
            {testResult && (
              <div
                className={`flex items-center gap-2 mt-3 p-3 rounded-xl text-[12px] font-bold ${
                  testResult.success ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 shrink-0" />
                )}
                {testResult.message}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* آخرین لاگ‌ها */}
      <Card
        title="آخرین رخدادهای Integration"
        icon={ListChecks}
        action={
          <button
            onClick={() => mutateLogs()}
            className="text-[11px] font-bold text-gray-500 hover:text-gray-700"
          >
            بروزرسانی
          </button>
        }
      >
        {!logs?.data || logs.data.length === 0 ? (
          <p className="text-[12px] text-gray-400">هنوز رخدادی ثبت نشده است.</p>
        ) : (
          <div className="space-y-1.5">
            {logs.data.map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between gap-2 p-2.5 rounded-lg text-[11px]"
                style={{ backgroundColor: "var(--color-background, #f9fafb)" }}
              >
                <span
                  className="font-bold shrink-0"
                  style={{ color: log.status === "SUCCESS" ? "#16a34a" : "#dc2626" }}
                >
                  {log.status === "SUCCESS" ? "موفق" : "ناموفق"}
                </span>
                <span className="text-gray-600 font-bold">
                  {log.provider?.name ?? "—"}
                </span>
                <span className="text-gray-400">{log.service?.name ?? "—"}</span>
                {log.errorCode && (
                  <span className="text-red-500">{log.errorCode}</span>
                )}
                <span className="text-gray-400 shrink-0">
                  {log.durationMs != null ? `${log.durationMs}ms` : "—"}
                </span>
                <span className="text-gray-400 shrink-0" dir="ltr">
                  {new Date(log.createdAt).toLocaleString("fa-IR")}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function FinotechCredentials({ onSaved }: { onSaved: (key: string) => void }) {
  const { data, mutate, isLoading } = useSWR<CredentialItem[]>(
    "/api/admin/integrations/providers/FINOTECH/credentials",
    fetcher,
  );
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reencrypting, setReencrypting] = useState(false);
  const [reencryptResult, setReencryptResult] = useState<string | null>(null);

  // FCS_CKM_EXT.1.2: پس از چرخش کلید رمزنگاری، Credentialها با کلید فعلی دوباره رمز می‌شوند
  const reencrypt = async () => {
    setReencrypting(true);
    setError(null);
    setReencryptResult(null);
    try {
      const res = await adminApi.post("/api/admin/integrations/credentials/re-encrypt");
      setReencryptResult(
        `${(res.data.reencrypted as number).toLocaleString("fa-IR")} از ${(res.data.total as number).toLocaleString("fa-IR")} مورد با کلید فعلی رمز شد`,
      );
      await mutate();
    } catch {
      setError("خطا در رمزنگاری مجدد");
    } finally {
      setReencrypting(false);
    }
  };
  const staleCount = data?.filter((c) => c.needsReencryption).length ?? 0;

  const save = async (key: string, value: string) => {
    if (!value.trim()) return;
    setSavingKey(key);
    setError(null);
    try {
      await adminApi.post("/api/admin/integrations/providers/FINOTECH/credentials", {
        key,
        value: value.trim(),
      });
      await mutate();
      onSaved(key);
    } catch {
      setError("خطا در ذخیره Credential");
    } finally {
      setSavingKey(null);
    }
  };

  if (isLoading) {
    return <Loader2 className="w-4 h-4 animate-spin text-gray-400" />;
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-[11px] font-bold text-red-600">{error}</p>
      )}
      {staleCount > 0 && (
        <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-amber-50 text-[11px] font-bold text-amber-700">
          <span>
            {staleCount.toLocaleString("fa-IR")} Credential با کلید قدیمی رمز شده است
          </span>
          <button
            onClick={reencrypt}
            disabled={reencrypting}
            className="shrink-0 px-3 py-1.5 rounded-lg text-white disabled:opacity-60"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            {reencrypting ? <Loader2 className="w-3 h-3 animate-spin" /> : "رمزنگاری مجدد با کلید فعلی"}
          </button>
        </div>
      )}
      {reencryptResult && (
        <p className="text-[11px] font-bold text-emerald-700">{reencryptResult}</p>
      )}
      {FINOTECH_CREDENTIAL_FIELDS.map((field) => {
        const existing = data?.find((c) => c.key === field.key);
        return (
          <div key={field.key}>
            <label className="text-[11px] font-bold text-gray-500 mb-1 block">
              {field.label}
              {existing && (
                <span className="text-gray-400 font-normal">
                  {" "}
                  — مقدار فعلی: {existing.maskedValue} — آخرین تعویض:{" "}
                  {new Date(existing.updatedAt).toLocaleDateString("fa-IR")}
                </span>
              )}
              {existing?.rotationDue && (
                <span className="badge mr-2" style={{ background: "#fef3c7", color: "#b45309" }}>
                  زمان تعویض فرارسیده
                </span>
              )}
            </label>
            <div className="flex items-center gap-2">
              <input
                type={field.secret ? "password" : "text"}
                placeholder={existing ? "برای تغییر، مقدار جدید وارد کنید" : "مقدار را وارد کنید"}
                dir="ltr"
                onBlur={(e) => {
                  const val = e.target.value;
                  if (val) {
                    save(field.key, val);
                    e.target.value = "";
                  }
                }}
                className="flex-1 px-3 py-2 rounded-xl border text-[13px]"
                style={{ borderColor: "var(--color-border)" }}
              />
              {savingKey === field.key && (
                <Loader2 className="w-4 h-4 animate-spin text-gray-400 shrink-0" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
