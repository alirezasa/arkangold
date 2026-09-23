// admin/app/(dashboard)/security/page.tsx
// امنیت و رمزنگاری (کلاس FCS): وضعیت اسرار، کلیدهای JWT، رمزنگاری Credentialها،
// نگهداری داده و شکست‌های رمزنگاری. این صفحه هیچ مقدار کلید یا رازی نمایش نمی‌دهد.
"use client";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import axios from "axios";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  KeyRound,
  Loader2,
  LockKeyhole,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  TimerReset,
  Vault,
  XCircle,
} from "lucide-react";
import { useAdminMe } from "@/app/hooks/useAdminMe";

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

type SecretSource = "vault" | "file" | "env" | "missing";

interface CryptoStatus {
  secrets: {
    vault: { configured: boolean; kvEnabled: boolean; kvPath: string | null; auth: "approle" | "token" | null };
    items: { name: string; source: SecretSource }[];
  };
  jwt: {
    algorithm: string;
    minBits: number;
    totalKeys: number;
    keys: {
      name: string;
      configured: boolean;
      bits: number;
      keyId: string | null;
      rotationInProgress: boolean;
      previousKeyId: string | null;
      strong: boolean;
    }[];
  };
  credentialEncryption: {
    backend: "vault-transit" | "local-aes-256-gcm";
    algorithm: string;
    keyBits: number;
    ivBits: number;
    tagBits: number;
    transitKey: string | null;
    currentKeyId: string | null;
    previousKeyIds: string[];
    maxAgeDays: number;
    credentials: {
      providerCode: string;
      providerName: string;
      key: string;
      keyVersion: string;
      needsReencryption: boolean;
      rotationDue: boolean;
      updatedAt: string;
    }[];
  };
  passwordHashing: { algorithm: string; cost: number; maxBytes: number };
  retention: {
    schedule: string;
    pending: { userSessions: number; adminSessions: number; otps: number };
    lastRun: { at: string; counts: { userSessions?: number; adminSessions?: number; otps?: number } } | null;
  };
  cryptoFailures: { last24h: number; last7d: number };
}

const JWT_PURPOSE: Record<string, string> = {
  JWT_ACCESS_SECRET: "توکن دسترسی کاربر",
  JWT_REFRESH_SECRET: "توکن تمدید کاربر",
  JWT_TEMP_SECRET: "توکن موقت ثبت‌نام",
  JWT_RESET_SECRET: "توکن بازیابی رمز",
  JWT_ADMIN_SECRET: "توکن دسترسی ادمین",
  JWT_ADMIN_REFRESH_SECRET: "توکن تمدید ادمین",
};

const SOURCE_META: Record<SecretSource, { label: string; bg: string; color: string }> = {
  vault: { label: "Vault", bg: "var(--color-emerald-light)", color: "var(--color-emerald)" },
  file: { label: "فایل secret", bg: "#e0f2fe", color: "#0369a1" },
  env: { label: "متغیر محیطی", bg: "#fef3c7", color: "#b45309" },
  missing: { label: "تنظیم نشده", bg: "#f3f4f6", color: "#6b7280" },
};

const fa = (n: number) => n.toLocaleString("fa-IR");

function getErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) return err.response?.data?.message || fallback;
  return fallback;
}

/** شناسه‌ی فنی (نام الگوریتم، متغیر، kid) — فونت پنل ارقام را فارسی می‌کند؛ این‌ها باید لاتین بمانند */
function Tech({ children }: { children: React.ReactNode }) {
  return (
    <bdi dir="ltr" className="font-mono text-[0.92em]">
      {children}
    </bdi>
  );
}

function Badge({ bg, color, children }: { bg: string; color: string; children: React.ReactNode }) {
  return (
    <span className="badge" style={{ background: bg, color }}>
      {children}
    </span>
  );
}

const OK = { bg: "var(--color-emerald-light)", color: "var(--color-emerald)" };
const WARN = { bg: "#fef3c7", color: "#b45309" };
const BAD = { bg: "#fee2e2", color: "#dc2626" };

function Card({
  icon: Icon,
  title,
  subtitle,
  action,
  children,
}: {
  icon: typeof KeyRound;
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-2xl p-4"
      style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-2 min-w-0">
          <Icon className="w-5 h-5 mt-0.5 text-gray-700 shrink-0" />
          <div className="min-w-0">
            <h2 className="font-black text-[14px] text-gray-900">{title}</h2>
            {subtitle && <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function StatTile({ label, value, tone }: { label: string; value: React.ReactNode; tone: "ok" | "warn" | "bad" }) {
  const t = tone === "ok" ? OK : tone === "warn" ? WARN : BAD;
  return (
    <div
      className="rounded-2xl p-3"
      style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <p className="text-[11px] text-gray-500 mb-1">{label}</p>
      <p className="font-black text-[15px]" style={{ color: t.color }}>
        {value}
      </p>
    </div>
  );
}

function ActionButton({
  onClick,
  loading,
  children,
}: {
  onClick: () => void;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold text-white disabled:opacity-60"
      style={{ backgroundColor: "var(--color-emerald)" }}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
      {children}
    </button>
  );
}

export default function SecurityPage() {
  const { data, isLoading, error, mutate } = useSWR<CryptoStatus>("/api/admin/security/crypto-status", fetcher, {
    revalidateOnFocus: false,
  });
  const { me } = useAdminMe();
  const canManage = !!me?.permissions.includes("security.crypto.manage");

  const [busy, setBusy] = useState<"reencrypt" | "retention" | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async (kind: "reencrypt" | "retention") => {
    setBusy(kind);
    setNotice(null);
    try {
      if (kind === "reencrypt") {
        const res = await axios.post("/api/admin/security/credentials/re-encrypt");
        setNotice({ ok: true, text: `${fa(res.data.reencrypted)} از ${fa(res.data.total)} Credential با کلید فعلی رمز شد` });
      } else {
        const res = await axios.post("/api/admin/security/retention/run");
        const c = res.data as { userSessions: number; adminSessions: number; otps: number };
        setNotice({
          ok: true,
          text: `حذف شد: ${fa(c.userSessions)} نشست کاربر، ${fa(c.adminSessions)} نشست ادمین، ${fa(c.otps)} کد یک‌بارمصرف`,
        });
      }
      await mutate();
    } catch (err) {
      setNotice({ ok: false, text: getErrorMessage(err, "عملیات ناموفق بود") });
    } finally {
      setBusy(null);
    }
  };

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

  const enc = data.credentialEncryption;
  const strongKeys = data.jwt.keys.filter((k) => k.configured && k.strong).length;
  const staleCreds = enc.credentials.filter((c) => c.needsReencryption).length;
  const dueCreds = enc.credentials.filter((c) => c.rotationDue).length;
  const rotatingJwt = data.jwt.keys.filter((k) => k.rotationInProgress);
  const envSecrets = data.secrets.items.filter((i) => i.source === "env").length;
  const isVaultTransit = enc.backend === "vault-transit";

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="w-5 h-5 text-gray-700" />
          <h1 className="text-lg font-black text-gray-900">امنیت و رمزنگاری</h1>
        </div>
        <p className="text-[12px] text-gray-400">
          وضعیت کلیدها، مدیریت اسرار و چرخش — مقدار هیچ کلید یا رازی در این صفحه نمایش داده نمی‌شود
        </p>
      </div>

      {notice && (
        <div
          className={`p-3 rounded-xl text-[12px] font-bold ${notice.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}
        >
          {notice.text}
        </div>
      )}

      {/* ─── خلاصه ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="کلیدهای JWT سالم"
          value={`${fa(strongKeys)} از ${fa(data.jwt.totalKeys)}`}
          tone={strongKeys === data.jwt.totalKeys ? "ok" : "bad"}
        />
        <StatTile
          label="رمزنگاری Credentialها"
          value={isVaultTransit ? <Tech>Vault Transit</Tech> : <>محلی <Tech>AES-256-GCM</Tech></>}
          tone={isVaultTransit ? "ok" : "warn"}
        />
        <StatTile
          label="نیازمند رمزنگاری مجدد / تعویض"
          value={`${fa(staleCreds)} / ${fa(dueCreds)}`}
          tone={staleCreds === 0 && dueCreds === 0 ? "ok" : "warn"}
        />
        <StatTile
          label="شکست رمزنگاری (۷ روز)"
          value={fa(data.cryptoFailures.last7d)}
          tone={data.cryptoFailures.last7d === 0 ? "ok" : "bad"}
        />
      </div>

      {/* ─── مدیریت اسرار ─── */}
      <Card
        icon={Vault}
        title="مدیریت اسرار"
        subtitle="منبع بارگذاری هر راز: Vault ← فایل secret ← متغیر محیطی"
      >
        <div className="flex flex-wrap items-center gap-2 mb-3 text-[12px]">
          {data.secrets.vault.configured ? (
            <Badge {...OK}>Vault متصل</Badge>
          ) : (
            <Badge {...WARN}>Vault پیکربندی نشده</Badge>
          )}
          {data.secrets.vault.kvPath && (
            <span className="text-gray-500">
              KV: <Tech>{data.secrets.vault.kvPath}</Tech>
            </span>
          )}
          {data.secrets.vault.auth && (
            <span className="text-gray-500">احراز هویت: {data.secrets.vault.auth === "approle" ? "AppRole" : "Token"}</span>
          )}
        </div>
        {envSecrets > 0 && (
          <p className="flex items-start gap-1.5 text-[11px] text-amber-700 mb-3">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span className="min-w-0">
              {fa(envSecrets)} راز از متغیر محیطی خوانده شده است؛ در محیط عملیاتی از Vault یا فایل secret استفاده کنید.
            </span>
          </p>
        )}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {data.secrets.items.map((item) => {
            const meta = SOURCE_META[item.source];
            return (
              <div
                key={item.name}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-[11px]"
                style={{ backgroundColor: "var(--color-bg-page)" }}
              >
                <span dir="ltr" title={item.name} className="min-w-0 font-mono font-bold text-gray-700 truncate">
                  {item.name}
                </span>
                <span className="shrink-0 whitespace-nowrap">
                  <Badge bg={meta.bg} color={meta.color}>
                    {meta.label}
                  </Badge>
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ─── کلیدهای JWT ─── */}
      <Card
        icon={LockKeyhole}
        title="کلیدهای امضای توکن (JWT)"
        subtitle={
          <>
            الگوریتم ثابت <Tech>{data.jwt.algorithm}</Tech> — حداقل طول کلید {fa(data.jwt.minBits)} بیت — هر کاربرد کلید مستقل
          </>
        }
      >
        <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--color-border)" }}>
          <table className="w-full admin-table">
            <thead>
              <tr>
                <th>کاربرد</th>
                <th>طول کلید</th>
                <th>شناسه‌ی کلید (kid)</th>
                <th>چرخش</th>
              </tr>
            </thead>
            <tbody>
              {data.jwt.keys.map((k) => (
                <tr key={k.name}>
                  <td>
                    <span className="font-bold">{JWT_PURPOSE[k.name] ?? k.name}</span>
                    <span dir="ltr" className="block text-[10px] text-gray-400 font-mono">
                      {k.name}
                    </span>
                  </td>
                  <td>
                    {!k.configured ? (
                      <Badge {...BAD}>تنظیم نشده</Badge>
                    ) : k.strong ? (
                      <Badge {...OK}>{fa(k.bits)} بیت</Badge>
                    ) : (
                      <Badge {...BAD}>{fa(k.bits)} بیت — ضعیف</Badge>
                    )}
                  </td>
                  <td dir="ltr" className="text-[11px] text-gray-500 font-mono">
                    {k.keyId ?? "—"}
                  </td>
                  <td>
                    {k.rotationInProgress ? (
                      <span className="text-[11px]">
                        <Badge {...WARN}>در دوره‌ی گذار</Badge>
                        <span dir="ltr" className="block text-[10px] text-gray-400 mt-1 font-mono">
                          قبلی: {k.previousKeyId}
                        </span>
                      </span>
                    ) : (
                      <span className="text-[11px] text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details className="mt-3 text-[11px] text-gray-500">
          <summary className="cursor-pointer font-bold text-gray-600">روال چرخش کلید JWT (بدون خروج کاربران)</summary>
          <ol className="list-decimal pr-5 mt-2 space-y-1 leading-6">
            <li>
              مقدار فعلی کلید را در <code dir="ltr">NAME_PREVIOUS</code> و کلید جدید (<code dir="ltr">openssl rand -base64 48</code>) را
              در <code dir="ltr">NAME</code> قرار دهید و برنامه را دوباره راه‌اندازی کنید.
            </li>
            <li>توکن‌های قبلی تا انقضا معتبر می‌مانند و توکن‌های جدید با کلید جدید صادر می‌شوند.</li>
            <li>
              پس از گذشت بیشینه‌ی عمر توکن (دسترسی ۱۵ دقیقه، تمدید ۷ روز)، <code dir="ltr">NAME_PREVIOUS</code> را حذف کنید تا
              کلید قدیمی امحا شود. {rotatingJwt.length > 0 && <b>({fa(rotatingJwt.length)} کلید اکنون در دوره‌ی گذار است)</b>}
            </li>
          </ol>
        </details>
      </Card>

      {/* ─── رمزنگاری Credentialها ─── */}
      <Card
        icon={ShieldCheck}
        title="رمزنگاری Credentialهای سرویس‌های ثالث"
        subtitle={
          <>
            <Tech>{enc.algorithm.toUpperCase()}</Tech> — کلید {fa(enc.keyBits)} بیت، IV {fa(enc.ivBits)} بیت، برچسب{" "}
            {fa(enc.tagBits)} بیت، گره‌خورده به زمینه (AAD)
          </>
        }
        action={
          canManage && staleCreds > 0 ? (
            <ActionButton onClick={() => run("reencrypt")} loading={busy === "reencrypt"}>
              رمزنگاری مجدد با کلید فعلی
            </ActionButton>
          ) : undefined
        }
      >
        <div className="flex flex-wrap items-center gap-2 mb-3 text-[12px]">
          {isVaultTransit ? (
            <Badge {...OK}>Vault Transit — کلید خارج از برنامه</Badge>
          ) : (
            <Badge {...WARN}>
              محلی <Tech>AES-256-GCM</Tech> — کلید در حافظه‌ی برنامه
            </Badge>
          )}
          {isVaultTransit ? (
            <span className="text-gray-500">
              <Tech>transit/{enc.transitKey}</Tech>
            </span>
          ) : (
            <span className="text-gray-500">
              کلید فعلی: <span dir="ltr" className="font-mono">{enc.currentKeyId ?? "—"}</span>
            </span>
          )}
          {enc.previousKeyIds.length > 0 && (
            <Badge {...WARN}>{fa(enc.previousKeyIds.length)} کلید قبلی بارگذاری‌شده (دوره‌ی چرخش)</Badge>
          )}
        </div>
        {enc.previousKeyIds.length > 0 && staleCreds === 0 && (
          <p className="flex items-start gap-1.5 text-[11px] text-emerald-700 mb-3">
            <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span className="min-w-0 leading-5">
              هیچ Credentialی به کلید قبلی وابسته نیست؛ اکنون می‌توانید{" "}
              <code dir="ltr" className="break-all">INTEGRATION_ENCRYPTION_KEYS_PREVIOUS</code> را حذف کنید تا کلید قدیمی
              امحا شود.
            </span>
          </p>
        )}
        {enc.credentials.length === 0 ? (
          <p className="text-[12px] text-gray-400 text-center py-6">Credentialی ثبت نشده است</p>
        ) : (
          <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--color-border)" }}>
            <table className="w-full admin-table">
              <thead>
                <tr>
                  <th>سرویس</th>
                  <th>کلید</th>
                  <th>نسخه‌ی رمزنگاری</th>
                  <th>آخرین تعویض</th>
                  <th>وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {enc.credentials.map((c) => (
                  <tr key={`${c.providerCode}:${c.key}`}>
                    <td className="font-bold">{c.providerName}</td>
                    <td className="text-[11px] text-gray-600">
                      <Tech>{c.key}</Tech>
                    </td>
                    <td className="text-[11px] text-gray-500">
                      {c.keyVersion === "legacy" ? "قالب قدیمی (بدون شناسه‌ی کلید)" : <Tech>{c.keyVersion}</Tech>}
                    </td>
                    <td className="text-[12px] text-gray-500">{new Date(c.updatedAt).toLocaleDateString("fa-IR")}</td>
                    <td className="space-x-1 space-x-reverse">
                      {c.needsReencryption && <Badge {...WARN}>کلید قدیمی</Badge>}
                      {c.rotationDue && <Badge {...BAD}>زمان تعویض (بیش از {fa(enc.maxAgeDays)} روز)</Badge>}
                      {!c.needsReencryption && !c.rotationDue && <Badge {...OK}>سالم</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {dueCreds > 0 && (
          <p className="text-[11px] text-gray-500 mt-2">
            تعویض مقدار Credentialهای قدیمی از صفحه‌ی{" "}
            <Link href="/integrations" className="font-bold underline">
              یکپارچه‌سازی‌ها
            </Link>{" "}
            انجام می‌شود.
          </p>
        )}
      </Card>

      {/* ─── نگهداری داده ─── */}
      <Card
        icon={TimerReset}
        title="نگهداری و حذف خودکار داده‌های منقضی"
        subtitle={`نشست‌ها و کدهای یک‌بارمصرف منقضی‌شده — ${data.retention.schedule}`}
        action={
          canManage ? (
            <ActionButton onClick={() => run("retention")} loading={busy === "retention"}>
              اجرای اکنون
            </ActionButton>
          ) : undefined
        }
      >
        <div className="grid sm:grid-cols-2 gap-3 text-[12px]">
          <div className="rounded-xl p-3" style={{ backgroundColor: "var(--color-bg-page)" }}>
            <p className="font-bold text-gray-700 mb-2">در انتظار حذف</p>
            <p className="text-gray-500">نشست کاربر: {fa(data.retention.pending.userSessions)}</p>
            <p className="text-gray-500">نشست ادمین: {fa(data.retention.pending.adminSessions)}</p>
            <p className="text-gray-500">کد یک‌بارمصرف: {fa(data.retention.pending.otps)}</p>
          </div>
          <div className="rounded-xl p-3" style={{ backgroundColor: "var(--color-bg-page)" }}>
            <p className="font-bold text-gray-700 mb-2">آخرین اجرا</p>
            {data.retention.lastRun ? (
              <>
                <p className="text-gray-500">{new Date(data.retention.lastRun.at).toLocaleString("fa-IR")}</p>
                <p className="text-gray-500">
                  حذف‌شده: {fa(data.retention.lastRun.counts.userSessions ?? 0)} نشست کاربر،{" "}
                  {fa(data.retention.lastRun.counts.adminSessions ?? 0)} نشست ادمین، {fa(data.retention.lastRun.counts.otps ?? 0)} کد
                </p>
              </>
            ) : (
              <p className="text-gray-400">هنوز اجرا نشده است</p>
            )}
          </div>
        </div>
      </Card>

      {/* ─── الگوریتم‌ها ─── */}
      <Card icon={ServerCog} title="الگوریتم‌ها و پارامترهای رمزنگاری" subtitle="فهرست کاربردهای رمزنگاری در محصول">
        <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--color-border)" }}>
          <table className="w-full admin-table">
            <thead>
              <tr>
                <th>کاربرد</th>
                <th>الگوریتم و پارامتر</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["رمزنگاری Credentialها", <><Tech>AES-256-GCM</Tech> (<Tech>NIST SP 800-38D</Tech>) با AAD{isVaultTransit ? " — داخل Vault" : ""}</>],
                  ["امضای توکن‌ها", <><Tech>{data.jwt.algorithm}</Tech> (<Tech>HMAC-SHA256</Tech>)، الگوریتم ثابت، شناسه‌ی کلید</>],
                  ["ذخیره‌ی رمز عبور", <><Tech>{data.passwordHashing.algorithm}</Tech>، هزینه‌ی {fa(data.passwordHashing.cost)}، نمک تصادفی، حداکثر {fa(data.passwordHashing.maxBytes)} بایت</>],
                  ["ذخیره‌ی کد یک‌بارمصرف", <><Tech>bcrypt</Tech>، هزینه‌ی ۱۰</>],
                  ["ذخیره‌ی refresh token و یکپارچگی رویدادها", <Tech>SHA-256</Tech>],
                  ["مقادیر تصادفی (OTP، IV، شناسه‌ها)", <>CSPRNG — <Tech>crypto.randomInt / randomBytes / randomUUID</Tech></>],
                  ["الگوریتم‌های ممنوع", <><Tech>MD5, SHA-1, DES, 3DES, RC4, ECB, CBC</Tech> — در محصول استفاده نمی‌شوند</>],
                ] as [string, React.ReactNode][]
              ).map(([use, algo]) => (
                <tr key={use}>
                  <td className="font-bold text-[12px]">{use}</td>
                  <td className="text-[12px] text-gray-600">{algo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ─── شکست‌ها ─── */}
      <Card icon={Database} title="شکست عملیات رمزنگاری" subtitle="هر شکست با پیام یکسان به کاربر و جزئیات کامل در گزارش فعالیت‌ها ثبت می‌شود">
        <div className="flex flex-wrap items-center gap-4 text-[12px]">
          <span className="flex items-center gap-1.5">
            {data.cryptoFailures.last24h === 0 ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <XCircle className="w-4 h-4 text-red-600" />
            )}
            ۲۴ ساعت گذشته: <b>{fa(data.cryptoFailures.last24h)}</b>
          </span>
          <span>
            ۷ روز گذشته: <b>{fa(data.cryptoFailures.last7d)}</b>
          </span>
          <Link href="/audit-log" className="font-bold underline text-gray-600">
            مشاهده در گزارش فعالیت‌ها (رویداد <Tech>security.crypto_failure</Tech>)
          </Link>
        </div>
      </Card>
    </div>
  );
}
