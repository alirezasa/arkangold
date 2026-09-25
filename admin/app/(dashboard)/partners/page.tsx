// admin/app/(dashboard)/partners/page.tsx — شرکای فروش (اسنپ‌پی، دیجی‌پی، اپ‌های همکار)
"use client";
import { useState } from "react";
import useSWR from "swr";
import { Handshake, KeyRound, Pencil, Plus } from "lucide-react";
import {
  ActionButton,
  Alert,
  Badge,
  Field,
  Modal,
  Num,
  PARTNER_KIND_FA,
  PARTNER_STATUS,
  PageHeader,
  Pagination,
  Spinner,
  Table,
  api,
  cardStyle,
  faDate,
  faDateTime,
  fetcher,
  grams,
  inputCls,
  signedToman,
  toman,
  tomanToRial,
  useAction,
  usePerm,
} from "@/app/components/finance/ui";

interface Partner {
  id: string;
  code: string;
  name: string;
  kind: string;
  providerKey: string | null;
  status: string;
  commissionPercent: string;
  commissionFixedRial: string;
  settlementDays: number;
  creditLimitRial: string | null;
  minOrderRial: string | null;
  maxOrderRial: string | null;
  allowedProducts: string[];
  balanceRial: string;
  contractNumber: string | null;
  contractStartAt: string | null;
  contractEndAt: string | null;
  contactName: string | null;
  contactPhone: string | null;
  email: string | null;
  website: string | null;
  iban: string | null;
  nationalId: string | null;
  economicCode: string | null;
  notes: string | null;
  apiEnabled: boolean;
  hasApiKey: boolean;
  apiKeyPrefix: string | null;
  apiIpWhitelist: string[];
  webhookUrl: string | null;
  openOrders: number;
  openReceivableRial: string;
  overdueOrders: number;
  overdueRial: string;
  soldOrders: number;
  soldRial: string;
  soldGrams: string;
  commissionRial: string;
}

const r2t = (v: string | null | undefined) => (v && Number(v) ? String(Math.round(Number(v) / 10)) : "");

function PartnerForm({ p, onDone }: { p?: Partner; onDone: () => void }) {
  const { data: providers } = useSWR<{ key: string; displayName: string; configured: boolean }[]>("/api/admin/partners/providers", fetcher);
  const [f, setF] = useState({
    name: p?.name ?? "",
    kind: p?.kind ?? "BNPL",
    providerKey: p?.providerKey ?? "",
    status: p?.status ?? "ACTIVE",
    commissionPercent: p?.commissionPercent ?? "0",
    commissionFixed: r2t(p?.commissionFixedRial),
    settlementDays: String(p?.settlementDays ?? 7),
    creditLimit: r2t(p?.creditLimitRial),
    minOrder: r2t(p?.minOrderRial),
    maxOrder: r2t(p?.maxOrderRial),
    melted: p ? p.allowedProducts.includes("MELTED_GOLD") : true,
    bullion: p ? p.allowedProducts.includes("BULLION") : false,
    contractNumber: p?.contractNumber ?? "",
    contractStartAt: p?.contractStartAt?.slice(0, 10) ?? "",
    contractEndAt: p?.contractEndAt?.slice(0, 10) ?? "",
    contactName: p?.contactName ?? "",
    contactPhone: p?.contactPhone ?? "",
    email: p?.email ?? "",
    website: p?.website ?? "",
    iban: p?.iban ?? "",
    nationalId: p?.nationalId ?? "",
    economicCode: p?.economicCode ?? "",
    notes: p?.notes ?? "",
    apiEnabled: p?.apiEnabled ?? false,
    ips: p?.apiIpWhitelist.join("\n") ?? "",
  });
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const act = useAction();
  const opt = (v: string) => (v ? v : undefined);
  const save = async () => {
    const body = {
      name: f.name,
      kind: f.kind,
      providerKey: opt(f.providerKey),
      status: f.status,
      commissionPercent: f.commissionPercent || "0",
      commissionFixedRial: f.commissionFixed ? String(tomanToRial(f.commissionFixed)) : "0",
      settlementDays: Number(f.settlementDays) || 0,
      creditLimitRial: f.creditLimit ? String(tomanToRial(f.creditLimit)) : undefined,
      minOrderRial: f.minOrder ? String(tomanToRial(f.minOrder)) : undefined,
      maxOrderRial: f.maxOrder ? String(tomanToRial(f.maxOrder)) : undefined,
      allowedProducts: [...(f.melted ? ["MELTED_GOLD"] : []), ...(f.bullion ? ["BULLION"] : [])],
      contractNumber: opt(f.contractNumber),
      contractStartAt: opt(f.contractStartAt),
      contractEndAt: opt(f.contractEndAt),
      contactName: opt(f.contactName),
      contactPhone: opt(f.contactPhone),
      email: opt(f.email),
      website: opt(f.website),
      iban: opt(f.iban),
      nationalId: opt(f.nationalId),
      economicCode: opt(f.economicCode),
      notes: opt(f.notes),
      apiEnabled: f.apiEnabled,
      apiIpWhitelist: f.ips.split(/[\s,]+/).filter(Boolean),
    };
    const ok = await act.run(() => (p ? api.patch(`/api/admin/partners/${p.id}`, body) : api.post("/api/admin/partners", body)));
    if (ok) onDone();
  };
  const inp = (k: keyof typeof f, label: string, hint?: string, ltr = false) => (
    <Field label={label} hint={hint}>
      <input value={f[k] as string} onChange={(e) => set(k, e.target.value)} className={inputCls} dir={ltr ? "ltr" : undefined} />
    </Field>
  );
  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-3 gap-3">
        {inp("name", "نام شریک")}
        <Field label="نوع همکاری">
          <select value={f.kind} onChange={(e) => set("kind", e.target.value)} className={inputCls}>
            {Object.entries(PARTNER_KIND_FA).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="آداپتور یکپارچه‌سازی" hint="برای اتصال مستقیم به API شریک">
          <select value={f.providerKey} onChange={(e) => set("providerKey", e.target.value)} className={inputCls}>
            <option value="">بدون اتصال مستقیم</option>
            {providers?.map((pr) => (
              <option key={pr.key} value={pr.key}>
                {pr.displayName} {pr.configured ? "" : "(در انتظار مستندات)"}
              </option>
            ))}
          </select>
        </Field>
        {inp("commissionPercent", "کارمزد شریک (درصد)", "از مبلغ هر سفارش کسر می‌شود", true)}
        {inp("commissionFixed", "کارمزد ثابت هر سفارش (تومان)", undefined, true)}
        {inp("settlementDays", "مهلت تسویه (روز)", "T+N", true)}
        {inp("creditLimit", "سقف طلب از شریک (تومان)", "خالی = بدون سقف", true)}
        {inp("minOrder", "حداقل مبلغ سفارش (تومان)", undefined, true)}
        {inp("maxOrder", "حداکثر مبلغ سفارش (تومان)", undefined, true)}
        {inp("contractNumber", "شماره قرارداد")}
        <Field label="شروع قرارداد">
          <input type="date" value={f.contractStartAt} onChange={(e) => set("contractStartAt", e.target.value)} className={inputCls} dir="ltr" />
        </Field>
        <Field label="پایان قرارداد">
          <input type="date" value={f.contractEndAt} onChange={(e) => set("contractEndAt", e.target.value)} className={inputCls} dir="ltr" />
        </Field>
        {inp("contactName", "رابط")}
        {inp("contactPhone", "تلفن رابط", undefined, true)}
        {inp("email", "ایمیل", undefined, true)}
        {inp("website", "وب‌سایت", undefined, true)}
        {inp("iban", "شبا", undefined, true)}
        {inp("nationalId", "شناسه ملی", undefined, true)}
        {inp("economicCode", "کد اقتصادی", undefined, true)}
        {p && (
          <Field label="وضعیت">
            <select value={f.status} onChange={(e) => set("status", e.target.value)} className={inputCls}>
              {Object.entries(PARTNER_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <div className="flex flex-wrap gap-4 text-[12px] font-bold text-gray-600">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={f.melted} onChange={(e) => set("melted", e.target.checked)} /> فروش طلای آب‌شده (واریز به کیف پول)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={f.bullion} onChange={(e) => set("bullion", e.target.checked)} /> فروش شمش کددار
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={f.apiEnabled} onChange={(e) => set("apiEnabled", e.target.checked)} /> دسترسی API فعال
        </label>
      </div>
      <Field label="IPهای مجاز API" hint="هر IP در یک خط — خالی = بدون محدودیت IP">
        <textarea value={f.ips} onChange={(e) => set("ips", e.target.value)} className={inputCls} rows={2} dir="ltr" />
      </Field>
      <Field label="توضیحات">
        <input value={f.notes} onChange={(e) => set("notes", e.target.value)} className={inputCls} />
      </Field>
      {act.error && <Alert kind="error" text={act.error} />}
      <ActionButton onClick={save} busy={act.busy} disabled={!f.name}>
        ذخیره
      </ActionButton>
    </div>
  );
}

function PartnerDetail({ p, onChanged }: { p: Partner; onChanged: () => void }) {
  const can = usePerm();
  const [page, setPage] = useState(1);
  const { data } = useSWR<{
    data: { id: string; type: string; debitRial: string; creditRial: string; balanceAfterRial: string; description: string; createdAt: string }[];
    page: number;
    totalPages: number;
  }>(`/api/admin/partners/${p.id}/statement?page=${page}`, fetcher);
  const act = useAction();
  const [key, setKey] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-3 gap-2 text-[12px]">
        <p>
          طلب از شریک: <b>{signedToman(p.balanceRial)}</b> تومان
        </p>
        <p>
          کارمزد: <b>{Number(p.commissionPercent).toLocaleString("fa-IR")}٪</b>
          {Number(p.commissionFixedRial) ? ` + ${toman(p.commissionFixedRial)} تومان` : ""}
        </p>
        <p>
          تسویه: <b>T+{p.settlementDays.toLocaleString("fa-IR")}</b> روز
        </p>
        <p>
          قرارداد: {p.contractNumber ?? "—"} ({faDate(p.contractStartAt)} تا {faDate(p.contractEndAt)})
        </p>
        <p>
          API: {p.apiEnabled ? "فعال" : "غیرفعال"} — کلید: {p.hasApiKey ? `${p.apiKeyPrefix}…` : "ندارد"}
        </p>
      </div>
      {can("partner.manage") && (
        <div className="flex flex-wrap gap-2">
          <ActionButton
            variant="secondary"
            busy={act.busy}
            onClick={() =>
              void act
                .run(async () => {
                  const r = await api.post<{ apiKey: string; message: string }>(`/api/admin/partners/${p.id}/api-key`);
                  setKey(r.data.apiKey);
                  onChanged();
                  return r;
                }, p.hasApiKey ? "کلید فعلی باطل و کلید جدید ساخته شود؟" : undefined)
            }
          >
            <KeyRound className="w-4 h-4" /> {p.hasApiKey ? "تعویض کلید API" : "ساخت کلید API"}
          </ActionButton>
          {p.hasApiKey && (
            <ActionButton
              variant="danger"
              busy={act.busy}
              onClick={() => void act.run(() => api.post(`/api/admin/partners/${p.id}/api-key/revoke`), "کلید API باطل شود؟").then(onChanged)}
            >
              ابطال کلید
            </ActionButton>
          )}
        </div>
      )}
      {key && (
        <Alert
          kind="warn"
          text={`کلید API (فقط همین یک‌بار نمایش داده می‌شود):\n${key}\n\nنشانی: /partner-api/v1 — هدر: x-api-key\nتوجه: تنظیم partner.api.enabled باید true باشد.`}
        />
      )}
      {act.error && <Alert kind="error" text={act.error} />}
      <p className="font-black text-[13px]">صورتحساب</p>
      {!data ? (
        <Spinner />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <th>تاریخ</th>
                <th>شرح</th>
                <th>بدهکار</th>
                <th>بستانکار</th>
                <th>مانده (تومان)</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{faDateTime(r.createdAt)}</td>
                  <td className="max-w-md">{r.description}</td>
                  <Num>{Number(r.debitRial) ? toman(r.debitRial) : "—"}</Num>
                  <Num>{Number(r.creditRial) ? toman(r.creditRial) : "—"}</Num>
                  <Num bold>{signedToman(r.balanceAfterRial)}</Num>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}
    </div>
  );
}

export default function PartnersPage() {
  const can = usePerm();
  const { data, isLoading, mutate } = useSWR<{ data: Partner[] }>("/api/admin/partners?limit=200", fetcher);
  const [form, setForm] = useState<{ p?: Partner } | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const current = data?.data.find((x) => x.id === detail);
  return (
    <div className="space-y-5">
      <PageHeader
        icon={Handshake}
        title="شرکای فروش"
        subtitle="سرویس‌های خرید اقساطی (اسنپ‌پی، دیجی‌پی، ...) و اپلیکیشن‌های همکار که طلای آرکان را به مشتریان خود می‌فروشند: قرارداد، کارمزد، مهلت تسویه، سقف اعتبار، کلید API و صورتحساب"
        actions={
          can("partner.manage") && (
            <ActionButton onClick={() => setForm({})}>
              <Plus className="w-4 h-4" /> شریک جدید
            </ActionButton>
          )
        }
      />
      <Alert
        kind="info"
        text="روند حسابداری: با تأیید هر سفارش، طلا به کیف پول مشتری (یا مالکیت شمش به نام او) منتقل و «طلب از شریک = مبلغ − کارمزد» ثبت می‌شود؛ کارمزد شریک هزینه‌ی فروش است و طلای فروخته‌شده به کسری پوشش خزانه اضافه می‌شود. با دریافت وجه از شریک، تسویه ثبت و طلب بسته می‌شود."
      />
      <div className="rounded-2xl p-4" style={cardStyle}>
        {isLoading || !data ? (
          <Spinner />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>کد</th>
                <th>نام</th>
                <th>نوع</th>
                <th>کارمزد</th>
                <th>فروش (تومان)</th>
                <th>طلا (گرم)</th>
                <th>تسویه‌نشده</th>
                <th>معوق</th>
                <th>مانده طلب</th>
                <th>وضعیت</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((p) => (
                <tr key={p.id}>
                  <Num bold>{p.code}</Num>
                  <td>
                    <button type="button" onClick={() => setDetail(p.id)} className="font-bold hover:underline">
                      {p.name}
                    </button>
                  </td>
                  <td>{PARTNER_KIND_FA[p.kind]}</td>
                  <Num>{Number(p.commissionPercent).toLocaleString("fa-IR")}٪</Num>
                  <Num>{toman(p.soldRial)}</Num>
                  <Num>{grams(p.soldGrams)}</Num>
                  <Num>
                    {p.openOrders.toLocaleString("fa-IR")} / {toman(p.openReceivableRial)}
                  </Num>
                  <Num>
                    <span className={p.overdueOrders ? "text-red-600 font-bold" : ""}>
                      {p.overdueOrders ? `${p.overdueOrders.toLocaleString("fa-IR")} / ${toman(p.overdueRial)}` : "—"}
                    </span>
                  </Num>
                  <Num bold>{signedToman(p.balanceRial)}</Num>
                  <td>
                    <Badge map={PARTNER_STATUS} value={p.status} />
                  </td>
                  <td>
                    {can("partner.manage") && (
                      <button type="button" onClick={() => setForm({ p })} className="p-1.5 text-gray-400 hover:text-gray-700" aria-label="ویرایش">
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
      {form && (
        <Modal title={form.p ? `ویرایش ${form.p.name}` : "شریک فروش جدید"} onClose={() => setForm(null)} wide>
          <PartnerForm
            p={form.p}
            onDone={() => {
              setForm(null);
              void mutate();
            }}
          />
        </Modal>
      )}
      {current && (
        <Modal title={`${current.code} — ${current.name}`} onClose={() => setDetail(null)} wide>
          <PartnerDetail p={current} onChanged={() => void mutate()} />
        </Modal>
      )}
    </div>
  );
}
