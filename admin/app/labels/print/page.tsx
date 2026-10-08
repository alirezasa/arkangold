// admin/app/labels/print/page.tsx
//
// چاپ برچسب ارسال سفارش‌ها با دستگاه لیبل پرینتر. هر برچسب یک صفحه‌ی چاپی هم‌اندازه‌ی رول
// برچسب است (@page size)، پس در پنجره‌ی چاپ کافی است چاپگر برچسب انتخاب و حاشیه «هیچ» باشد.
//
// پارامترها: orders=id1,id2 — template=شناسه طرح — auto=1 چاپ خودکار — sample=1 چاپ آزمایشی با داده نمونه
"use client";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import axios from "axios";
import { AlertTriangle, ChevronDown, Loader2, Printer, X } from "lucide-react";
import { LabelView } from "@/app/components/labels/LabelView";
import { buildLabels, MAX_LABELS_PER_PRINT, SAMPLE_DATA } from "@/app/components/labels/fields";
import { REPEAT_FA, type LabelTemplate, type PrintData } from "@/app/components/labels/types";
import { getErrorMessage } from "@/app/components/agents/ui";
import { PrinterGuide } from "@/app/components/labels/PrinterGuide";

export default function LabelPrintPage() {
  return (
    <Suspense fallback={<Loading />}>
      <LabelPrint />
    </Suspense>
  );
}

function Loading() {
  return (
    <div className="flex justify-center pt-24 text-gray-500">
      <Loader2 className="w-7 h-7 animate-spin" />
    </div>
  );
}

function LabelPrint() {
  const params = useSearchParams();
  const orderIds = useMemo(() => (params.get("orders") ?? "").split(",").filter(Boolean), [params]);
  const sample = params.get("sample") === "1";
  const auto = params.get("auto") === "1";

  const [templates, setTemplates] = useState<LabelTemplate[] | null>(null);
  const [data, setData] = useState<PrintData | null>(null);
  const [templateId, setTemplateId] = useState(params.get("template") ?? "");
  const [copies, setCopies] = useState(1);
  const [error, setError] = useState("");
  const [logged, setLogged] = useState(false);
  const [guide, setGuide] = useState(false);
  const autoDone = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const wanted = params.get("template");
    const load = async () => {
      const list = (await axios.get<LabelTemplate[]>("/api/admin/shop-labels/templates?active=true")).data;
      // طرح غیرفعال فقط برای چاپ آزمایشی از صفحه‌ی طراحی بارگذاری می‌شود
      if (wanted && !list.some((t) => t.id === wanted)) {
        const one = (await axios.get<LabelTemplate>(`/api/admin/shop-labels/templates/${wanted}`)).data;
        list.unshift(one);
      }
      const printData = sample
        ? SAMPLE_DATA
        : orderIds.length
          ? (await axios.post<PrintData>("/api/admin/shop-labels/print-data", { orderIds })).data
          : null;
      if (cancelled) return;
      setTemplates(list);
      setData(printData);
      setTemplateId((cur) => cur || list.find((t) => t.isDefault)?.id || list[0]?.id || "");
      if (!printData) setError("سفارشی برای چاپ برچسب انتخاب نشده است");
    };
    load().catch((e) => !cancelled && setError(getErrorMessage(e, "بارگذاری اطلاعات برچسب ناموفق بود")));
    return () => {
      cancelled = true;
    };
  }, [orderIds, sample, params]);

  const template = templates?.find((t) => t.id === templateId) ?? null;
  const labels = useMemo(() => (template && data ? buildLabels(data, template.repeat, copies) : []), [template, data, copies]);
  const truncated = labels.length >= MAX_LABELS_PER_PRINT;

  const print = async () => {
    await document.fonts?.ready;
    window.print();
    if (!sample && data?.orders.length && !logged) {
      setLogged(true);
      axios.post("/api/admin/shop-labels/print-log", { orderIds: data.orders.map((o) => o.id) }).catch(() => setLogged(false));
    }
  };

  useEffect(() => {
    if (!auto || autoDone.current || !labels.length) return;
    autoDone.current = true;
    const t = setTimeout(() => void print(), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- فقط یک‌بار پس از آماده شدن برچسب‌ها
  }, [auto, labels.length]);

  const w = template?.size.widthMm ?? 100;
  const h = template?.size.heightMm ?? 100;

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      <style>{`
        @page { size: ${w}mm ${h}mm; margin: 0; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          .label-toolbar { display: none !important; }
          .label-list { display: block !important; padding: 0 !important; }
          .label-page { margin: 0 !important; box-shadow: none !important; break-after: page; page-break-after: always; }
          .label-page:last-child { break-after: auto; page-break-after: auto; }
        }
      `}</style>

      <div className="label-toolbar sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 space-y-3 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void print()}
            disabled={!labels.length}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold text-white disabled:opacity-50"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            <Printer className="w-4 h-4" /> چاپ {labels.length ? `${labels.length.toLocaleString("fa-IR")} برچسب` : "برچسب"}
          </button>
          <label className="flex items-center gap-2 text-[12px] font-bold text-gray-600">
            طرح
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="px-3 py-2 rounded-xl border border-gray-200 text-[12px] bg-white">
              {(templates ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.size.widthMm}×{t.size.heightMm} میلی‌متر
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-[12px] font-bold text-gray-600">
            نسخه از هر برچسب
            <select value={copies} onChange={(e) => setCopies(Number(e.target.value))} className="px-3 py-2 rounded-xl border border-gray-200 text-[12px] bg-white">
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n.toLocaleString("fa-IR")}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => setGuide((v) => !v)} className="flex items-center gap-1 text-[12px] font-bold text-gray-500">
            راهنمای تنظیم دستگاه <ChevronDown className={`w-4 h-4 transition-transform ${guide ? "rotate-180" : ""}`} />
          </button>
          <button type="button" onClick={() => window.close()} className="mr-auto p-2 text-gray-400 hover:text-gray-600" aria-label="بستن">
            <X className="w-5 h-5" />
          </button>
        </div>
        {template && (
          <p className="text-[11px] text-gray-500">
            {REPEAT_FA[template.repeat]} — اندازه {template.size.name} ({template.size.dpi} DPI)
            {sample && " — چاپ آزمایشی با داده‌ی نمونه"}
            {logged && " — چاپ ثبت شد"}
          </p>
        )}
        {guide && template && <PrinterGuide widthMm={w} heightMm={h} dpi={template.size.dpi} />}
        {error && (
          <p className="flex items-center gap-2 text-[12px] font-bold text-red-600">
            <AlertTriangle className="w-4 h-4" /> {error}
          </p>
        )}
        {data?.skipped.map((s) => (
          <p key={s.id} className="flex items-center gap-2 text-[12px] text-amber-700">
            <AlertTriangle className="w-4 h-4" /> سفارش {s.orderNumber ?? s.id.slice(0, 8)}: {s.reason} — برچسب چاپ نمی‌شود
          </p>
        ))}
        {truncated && (
          <p className="text-[12px] text-amber-700">حداکثر {MAX_LABELS_PER_PRINT.toLocaleString("fa-IR")} برچسب در هر نوبت چاپ می‌شود؛ بقیه را در نوبت بعد چاپ کنید.</p>
        )}
        {!templates && !error && <Loading />}
        {templates && templates.length === 0 && <p className="text-[12px] text-red-600">طرح برچسب فعالی تعریف نشده است.</p>}
      </div>

      <div className="label-list flex flex-wrap justify-center gap-4 p-6">
        {template &&
          labels.map((l) => (
            <div
              key={l.key}
              className="label-page bg-white shadow"
              style={{ width: `${w}mm`, height: `${Math.max(1, h - 0.2)}mm`, overflow: "hidden" }}
            >
              <LabelView
                widthMm={w}
                heightMm={h}
                dpi={template.size.dpi}
                elements={template.elements}
                ctx={l.ctx}
                items={l.order.items}
              />
            </div>
          ))}
      </div>
    </div>
  );
}
