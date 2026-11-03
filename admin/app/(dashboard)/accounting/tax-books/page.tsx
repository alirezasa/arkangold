// admin/app/(dashboard)/accounting/tax-books/page.tsx — دفاتر تجاری الکترونیکی (سازمان امور مالیاتی)
"use client";
import { useState } from "react";
import useSWR from "swr";
import { Download, FileSpreadsheet, RefreshCw, ShieldCheck } from "lucide-react";
import {
  ActionButton,
  Alert,
  Badge,
  Field,
  Num,
  PageHeader,
  Spinner,
  Table,
  api,
  cardStyle,
  faDateTime,
  fetcher,
  inputCls,
  toman,
  useAction,
  usePerm,
} from "@/app/components/finance/ui";
import JalaliDateInput from "@/app/components/JalaliDateInput";

type Mode = "DOCUMENT" | "MONTHLY";
type Format = "csv" | "xlsx";

interface ExportRow {
  id: string;
  trackingCode: string;
  periodStartJalali: string;
  periodEndJalali: string;
  mode: Mode;
  format: Format;
  journalCount: number;
  recordCount: number;
  totalDebitRial: string;
  status: "ACTIVE" | "SUPERSEDED";
  note: string | null;
  createdAt: string;
}

interface Overview {
  fiscalYears: { id: string; title: string; status: string; firstDayJalali: string; lastDayJalali: string }[];
  fiscalYearId: string | null;
  lockedUntil: string | null;
  headers: string[];
  limits: { xlsxMaxRecords: number };
  next: { start: string; startJalali: string; suggestedEnd: string | null; maxEnd: string; completed: boolean } | null;
  exports: ExportRow[];
}

interface Record9 {
  row: number;
  date: string;
  kolCode: string;
  kolName: string;
  moeinCode: string;
  moeinName: string;
  description: string;
  debitRial: string;
  creditRial: string;
}

interface Preview {
  period: { start: string; end: string; startJalali: string; endJalali: string };
  journalCount: number;
  eventCount: number;
  recordCount: number;
  totalDebitRial: string;
  totalCreditRial: string;
  balanced: boolean;
  hasErrors: boolean;
  issues: { level: "error" | "warning"; message: string }[];
  recommendedFormat: Format;
  sample?: Record9[];
}

interface FilePayload {
  name: string;
  contentType: string;
  base64: string;
}

const EXPORT_STATUS = {
  ACTIVE: { label: "فعال", cls: "bg-green-50 text-green-700" },
  SUPERSEDED: { label: "جایگزین‌شده", cls: "bg-gray-100 text-gray-500" },
};

function saveFile(f: FilePayload) {
  const bin = atob(f.base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: f.contentType }));
  const a = document.createElement("a");
  a.href = url;
  a.download = f.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export default function TaxBooksPage() {
  const can = usePerm();
  const [yearId, setYearId] = useState("");
  const key = `/api/admin/accounting/tax-books${yearId ? `?fiscalYearId=${yearId}` : ""}`;
  const { data, isLoading, mutate } = useSWR<Overview>(key, fetcher);
  const act = useAction();
  const [end, setEnd] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("DOCUMENT");
  const [includeClosing, setIncludeClosing] = useState(true);
  const [tracking, setTracking] = useState("");
  const [format, setFormat] = useState<Format | "">("");
  const [lockPeriod, setLockPeriod] = useState(true);
  const [note, setNote] = useState("");
  const [replace, setReplace] = useState<ExportRow | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const manage = can("accounting.period.manage");

  const fiscalYearId = data?.fiscalYearId ?? "";
  const endDate = end ?? data?.next?.suggestedEnd ?? "";
  const lastTracking = data?.exports[0]?.trackingCode ?? "";
  const trackingCode = tracking || lastTracking;
  const body = () => ({
    fiscalYearId,
    mode,
    includeClosing,
    ...(replace ? { replaceExportId: replace.id } : { endDate }),
  });
  const tooMany = (preview?.recordCount ?? 0) > (data?.limits.xlsxMaxRecords ?? 1000);
  const chosenFormat: Format = format || preview?.recommendedFormat || "xlsx";

  const runPreview = async () => {
    let result: Preview | null = null;
    const ok = await act.run(async () => {
      const res = await api.post<Preview>("/api/admin/accounting/tax-books/preview", body());
      result = res.data;
      return { data: { message: "پیش‌نمایش آماده شد" } };
    });
    if (ok) setPreview(result);
  };

  const finalize = async () => {
    if (!preview) return;
    const ok = await act.run(
      () => api.post("/api/admin/accounting/finalize", { upTo: preview.period.end }),
      `اسناد تا ${preview.period.endJalali} قطعی و دوره تا همان روز قفل شود؟ این عمل برگشت‌پذیر نیست.`,
    );
    if (ok) await runPreview();
  };

  const doExport = async () => {
    if (!preview) return;
    const ok = await act.run(async () => {
      const res = await api.post<{ message: string; file: FilePayload }>("/api/admin/accounting/tax-books/export", {
        ...body(),
        trackingCode,
        format: tooMany ? "csv" : chosenFormat,
        lockPeriod,
        note: note || undefined,
      });
      saveFile(res.data.file);
      return res;
    }, `فایل بازه‌ی ${preview.period.startJalali} تا ${preview.period.endJalali} ثبت شود؟${lockPeriod ? " دوره تا پایان بازه قفل می‌شود." : ""}`);
    if (ok) {
      setPreview(null);
      setReplace(null);
      setEnd(null);
      setNote("");
      void mutate();
    }
  };

  const download = async (row: ExportRow, f: Format) => {
    await act.run(async () => {
      const res = await api.post<{ message: string; unchanged: boolean; file: FilePayload }>(
        `/api/admin/accounting/tax-books/${row.id}/download`,
        { format: f },
      );
      saveFile(res.data.file);
      return res;
    });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        icon={FileSpreadsheet}
        title="دفاتر تجاری الکترونیکی"
        subtitle="ساخت فایل بارگذاری در «سامانه‌ی دفاتر تجاری الکترونیکی» سازمان امور مالیاتی: ۹ ستون، تاریخ شمسی به وقت تهران، فقط مبالغ ریالی. ابتدای هر بازه خودکار (روز بعد از فایل قبلی) است و بازه‌ها هم‌پوشانی ندارند."
      />
      {isLoading || !data ? (
        <Spinner />
      ) : !data.fiscalYears.length ? (
        <Alert kind="warn" text="ابتدا در «سال مالی و قفل دوره» سال مالی را تعریف کنید." />
      ) : (
        <>
          <div className="rounded-2xl p-4 space-y-4" style={cardStyle}>
            <div className="grid md:grid-cols-3 gap-3">
              <Field label="سال مالی">
                <select
                  value={fiscalYearId}
                  onChange={(e) => {
                    setYearId(e.target.value);
                    setPreview(null);
                    setReplace(null);
                    setEnd(null);
                  }}
                  className={inputCls}
                >
                  {data.fiscalYears.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.title} ({y.firstDayJalali} تا {y.lastDayJalali})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="کد رهگیری پلمپ دفاتر" hint="از سامانه‌ی پلمپ الکترونیک دفاتر سازمان ثبت؛ برای همان سال مالی">
                <input value={trackingCode} onChange={(e) => setTracking(e.target.value)} className={inputCls} dir="ltr" />
              </Field>
              <Field label="ابتدای بازه (خودکار)">
                <input
                  value={replace ? `${replace.periodStartJalali} (فایل اصلاحی)` : (data.next?.startJalali ?? "—")}
                  readOnly
                  className={`${inputCls} bg-gray-50`}
                  dir="ltr"
                />
              </Field>
            </div>
            {replace ? (
              <Alert
                kind="info"
                text={`ساخت فایل اصلاحی برای بازه‌ی ${replace.periodStartJalali} تا ${replace.periodEndJalali} — پس از ثبت، فایل قبلی «جایگزین‌شده» علامت می‌خورد. در سامانه هم هنگام بارگذاری، فایل قبلی همین بازه حذف و این فایل جایگزین می‌شود.`}
              />
            ) : data.next?.completed ? (
              <Alert kind="success" text="همه‌ی بازه‌های این سال مالی بارگذاری شده‌اند." />
            ) : null}
            <div className="grid md:grid-cols-3 gap-3">
              {!replace && (
                <Field label="انتهای بازه (تاریخ آخرین رویداد فایل)" hint="روزی گذشته؛ پیشنهاد: پایان ماه شمسی قبل">
                  <JalaliDateInput value={endDate} onChange={(v) => { setEnd(v); setPreview(null); }} max={data.next?.maxEnd} className={inputCls} />
                </Field>
              )}
              <Field label="نوع ردیف‌ها">
                <select value={mode} onChange={(e) => { setMode(e.target.value as Mode); setPreview(null); }} className={inputCls}>
                  <option value="DOCUMENT">سندبه‌سند (هر سند قطعی یک ردیف)</option>
                  <option value="MONTHLY">تجمیعی ماهانه (هر ماه شمسی یک ردیف)</option>
                </select>
              </Field>
              <Field label="قالب فایل" hint={`بیش از ${data.limits.xlsxMaxRecords.toLocaleString("fa-IR")} رکورد فقط CSV`}>
                <select value={format} onChange={(e) => setFormat(e.target.value as Format | "")} className={inputCls}>
                  <option value="">خودکار</option>
                  <option value="xlsx" disabled={tooMany}>
                    اکسل (xlsx)
                  </option>
                  <option value="csv">CSV</option>
                </select>
              </Field>
            </div>
            <div className="flex flex-wrap gap-4 text-[12px] font-bold text-gray-600">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={includeClosing} onChange={(e) => { setIncludeClosing(e.target.checked); setPreview(null); }} />
                سند اختتامیه‌ی پایان سال در فایل بیاید
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={lockPeriod} onChange={(e) => setLockPeriod(e.target.checked)} />
                پس از ثبت، دوره تا انتهای بازه قفل شود (توصیه‌شده)
              </label>
            </div>
            <Field label="یادداشت (اختیاری)">
              <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="مثلاً بارگذاری شد در تاریخ ..." />
            </Field>
            <div className="flex flex-wrap gap-2">
              <ActionButton variant="secondary" onClick={runPreview} busy={act.busy} disabled={!fiscalYearId || (!replace && !endDate)}>
                <ShieldCheck className="w-4 h-4" /> پیش‌نمایش و کنترل
              </ActionButton>
              {replace && (
                <ActionButton variant="secondary" onClick={() => { setReplace(null); setPreview(null); }}>
                  انصراف از فایل اصلاحی
                </ActionButton>
              )}
            </div>
            {act.error && <Alert kind="error" text={act.error} />}
          </div>

          {preview && (
            <div className="rounded-2xl p-4 space-y-3" style={cardStyle}>
              <p className="font-black text-[13px]">
                بازه‌ی {preview.period.startJalali} تا {preview.period.endJalali} — {preview.journalCount.toLocaleString("fa-IR")} سند،{" "}
                {preview.eventCount.toLocaleString("fa-IR")} ردیف، {preview.recordCount.toLocaleString("fa-IR")} رکورد
              </p>
              <p className="text-[12px] text-gray-500">
                جمع بدهکار {toman(preview.totalDebitRial)} تومان — جمع بستانکار {toman(preview.totalCreditRial)} تومان —{" "}
                {preview.balanced ? "تراز است ✓" : "تراز نیست ✗"} (مبالغ فایل به ریال است)
              </p>
              {preview.issues.map((i, n) => (
                <Alert key={n} kind={i.level === "error" ? "error" : "warn"} text={i.message} />
              ))}
              <div className="flex flex-wrap gap-2">
                {manage && preview.issues.some((i) => i.level === "error" && i.message.includes("قطعی")) && (
                  <ActionButton variant="secondary" onClick={finalize} busy={act.busy}>
                    قطعی‌سازی اسناد تا {preview.period.endJalali}
                  </ActionButton>
                )}
                {manage && (
                  <ActionButton onClick={doExport} busy={act.busy} disabled={preview.hasErrors || !trackingCode || !preview.recordCount}>
                    <Download className="w-4 h-4" /> ثبت و دریافت فایل {(tooMany ? "csv" : chosenFormat).toUpperCase()}
                  </ActionButton>
                )}
              </div>
              {!trackingCode && <p className="text-[11px] text-red-600">کد رهگیری پلمپ را وارد کنید.</p>}
              {!!preview.sample?.length && (
                <div className="max-h-[480px] overflow-auto">
                  <Table>
                    <thead>
                      <tr>
                        {data.headers.map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.sample.map((r, i) => (
                        <tr key={i}>
                          <Num>{r.row}</Num>
                          <td dir="ltr">{r.date}</td>
                          <Num>{r.kolCode}</Num>
                          <td>{r.kolName}</td>
                          <Num>{r.moeinCode || "—"}</Num>
                          <td>{r.moeinName || "—"}</td>
                          <td className="text-[11px] max-w-xs">{r.description}</td>
                          <Num>{r.debitRial === "0" ? "" : Number(r.debitRial).toLocaleString("fa-IR")}</Num>
                          <Num>{r.creditRial === "0" ? "" : Number(r.creditRial).toLocaleString("fa-IR")}</Num>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  {preview.recordCount > preview.sample.length && (
                    <p className="text-center text-[11px] text-gray-400 py-2">
                      نمایش {preview.sample.length.toLocaleString("fa-IR")} رکورد اول از {preview.recordCount.toLocaleString("fa-IR")}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="rounded-2xl p-4 space-y-2" style={cardStyle}>
            <p className="font-black text-[13px]">فایل‌های ثبت‌شده‌ی این سال مالی</p>
            <Table>
              <thead>
                <tr>
                  <th>بازه</th>
                  <th>نوع</th>
                  <th>سند / رکورد</th>
                  <th>جمع گردش (تومان)</th>
                  <th>کد رهگیری</th>
                  <th>ثبت</th>
                  <th>وضعیت</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.exports.map((e) => (
                  <tr key={e.id} className={e.status === "ACTIVE" ? "" : "opacity-60"}>
                    <td dir="ltr" className="font-bold whitespace-nowrap">
                      {e.periodStartJalali} → {e.periodEndJalali}
                    </td>
                    <td>{e.mode === "MONTHLY" ? "ماهانه" : "سندبه‌سند"}</td>
                    <td>
                      {e.journalCount.toLocaleString("fa-IR")} / {e.recordCount.toLocaleString("fa-IR")}
                    </td>
                    <Num>{toman(e.totalDebitRial)}</Num>
                    <td dir="ltr">{e.trackingCode}</td>
                    <td className="text-[11px]">{faDateTime(e.createdAt)}</td>
                    <td>
                      <Badge map={EXPORT_STATUS} value={e.status} />
                    </td>
                    <td className="whitespace-nowrap space-x-2 space-x-reverse">
                      <button type="button" className="text-[11px] font-bold text-blue-700" onClick={() => void download(e, "csv")}>
                        CSV
                      </button>
                      {e.recordCount <= data.limits.xlsxMaxRecords && (
                        <button type="button" className="text-[11px] font-bold text-emerald-700" onClick={() => void download(e, "xlsx")}>
                          اکسل
                        </button>
                      )}
                      {manage && e.status === "ACTIVE" && (
                        <button
                          type="button"
                          className="text-[11px] font-bold text-purple-700 inline-flex items-center gap-1"
                          onClick={() => {
                            setReplace(e);
                            setMode(e.mode);
                            setPreview(null);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          <RefreshCw className="w-3 h-3" /> فایل اصلاحی
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {!data.exports.length && <p className="text-center text-[12px] text-gray-400 py-6">هنوز فایلی برای این سال مالی ثبت نشده است</p>}
            {act.success && <Alert kind="success" text={act.success} />}
          </div>
        </>
      )}
    </div>
  );
}
