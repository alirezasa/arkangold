// admin/app/components/shop/PricingFormulaEditor.tsx
"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { adminApi } from "@/app/core/api";
import { Plus, Trash2, Loader2, AlertCircle } from "lucide-react";

const fetcher = (url: string) => adminApi.get(url).then((r) => r.data);

interface ComponentDef {
  id: string;
  key: string;
  label: string;
}
interface Row {
  componentKey: string;
  baseType: "GOLD_VALUE" | "RUNNING_TOTAL" | "FIXED";
  valueType: "PERCENT" | "FIXED_RIAL";
  value: number;
  sortOrder: number;
}
interface PreviewLine {
  key: string;
  label: string;
  amountRial: string;
}
interface PreviewResult {
  purityKarat: string | null;
  goldPricePerGramRial: string | null;
  goldValueRial: string;
  lines: PreviewLine[];
  finalPriceRial: string;
}
interface ProductPricingComponentDto {
  componentKey: string;
  baseType: Row["baseType"];
  valueType: Row["valueType"];
  value: string;
  sortOrder: number;
}
interface ProductWithPricing {
  purityKarat: "K18" | "K24" | null;
  pricingComponents: ProductPricingComponentDto[];
}

export default function PricingFormulaEditor({
  productId,
}: {
  productId: string;
}) {
  const { data: allComponents } = useSWR<ComponentDef[]>(
    "/api/admin/shop/pricing-components",
    fetcher,
  );
  const { data: current, mutate } = useSWR<ProductWithPricing>(
    `/api/admin/shop/products/${productId}`,
    fetcher,
  );

  const [purity, setPurity] = useState<"" | "K18" | "K24">("");
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [previewWeight, setPreviewWeight] = useState(1);
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(
    null,
  );
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (!current) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPurity(current.purityKarat ?? "");
    setRows(
      current.pricingComponents.map((c) => ({
        componentKey: c.componentKey,
        baseType: c.baseType,
        valueType: c.valueType,
        value: Number(c.value),
        sortOrder: c.sortOrder,
      })),
    );
  }, [current]);

  const addRow = () =>
    setRows((r) => [
      ...r,
      {
        componentKey: allComponents?.[0]?.key ?? "",
        baseType: "GOLD_VALUE",
        valueType: "PERCENT",
        value: 0,
        sortOrder: r.length,
      },
    ]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await adminApi.put(`/api/admin/shop/products/${productId}/pricing`, {
        purityKarat: purity || undefined,
        components: rows.map((r, i) => ({ ...r, sortOrder: i })),
      });
      await mutate();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("خطا در ذخیره فرمول قیمت");
    } finally {
      setSaving(false);
    }
  };

  const runPreview = async () => {
    setPreviewLoading(true);
    try {
      const res = await adminApi.get(
        `/api/admin/shop/products/${productId}/pricing-preview?weightGrams=${previewWeight}`,
      );
      setPreviewResult(res.data);
    } catch {
      setError("برای پیش‌نمایش، ابتدا فرمول را ذخیره کنید");
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div
      className="rounded-2xl p-5 space-y-4"
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      <h2 className="text-[13px] font-black text-gray-700">فرمول قیمت‌گذاری</h2>
      <p className="text-[11px] text-gray-400 -mt-2">
        اگر عیار طلا انتخاب شود، مبنای فرمول قیمت لحظه‌ای طلا خواهد بود (نه قیمت
        پایهٔ محصول). هر آیتم فرمول می‌تواند روی «ارزش طلا» یا «جمع تا این
        مرحله» اعمال شود.
      </p>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-600 text-[13px] font-bold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}
      {saved && (
        <div className="p-3 rounded-xl bg-green-50 text-green-600 text-[13px] font-bold">
          فرمول ذخیره شد ✓
        </div>
      )}

      <div className="flex items-center gap-3">
        <label className="text-[12px] font-bold text-gray-500">عیار طلا</label>
        <select
          value={purity}
          onChange={(e) => setPurity(e.target.value as "" | "K18" | "K24")}
          className="px-3 py-2 rounded-xl border border-gray-200 text-sm"
        >
          <option value="">— محصول غیرطلایی (قیمت پایه) —</option>
          <option value="K18">۱۸ عیار</option>
          <option value="K24">۲۴ عیار</option>
        </select>
      </div>

      <div className="space-y-2">
        {rows.map((row, i) => (
          <div
            key={i}
            className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end p-3 rounded-xl"
            style={{ backgroundColor: "var(--color-bg-page)" }}
          >
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400">
                آیتم
              </label>
              <select
                value={row.componentKey}
                onChange={(e) => {
                  const v = [...rows];
                  v[i].componentKey = e.target.value;
                  setRows(v);
                }}
                className="w-full px-2 py-2 rounded-lg border border-gray-200 text-[12px]"
              >
                {allComponents?.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400">
                مبنا
              </label>
              <select
                value={row.baseType}
                onChange={(e) => {
                  const v = [...rows];
                  v[i].baseType = e.target.value as Row["baseType"];
                  setRows(v);
                }}
                className="w-full px-2 py-2 rounded-lg border border-gray-200 text-[12px]"
              >
                <option value="GOLD_VALUE">روی ارزش طلا</option>
                <option value="RUNNING_TOTAL">روی جمع تا این مرحله</option>
                <option value="FIXED">مقدار مستقل</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400">
                نوع مقدار
              </label>
              <select
                value={row.valueType}
                onChange={(e) => {
                  const v = [...rows];
                  v[i].valueType = e.target.value as Row["valueType"];
                  setRows(v);
                }}
                className="w-full px-2 py-2 rounded-lg border border-gray-200 text-[12px]"
              >
                <option value="PERCENT">درصد</option>
                <option value="FIXED_RIAL">مبلغ ثابت (ریال)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400">
                مقدار {row.valueType === "PERCENT" ? "(٪)" : "(ریال)"}
              </label>
              <input
                type="number"
                dir="ltr"
                value={row.value}
                onChange={(e) => {
                  const v = [...rows];
                  v[i].value = Number(e.target.value);
                  setRows(v);
                }}
                className="w-full px-2 py-2 rounded-lg border border-gray-200 text-[12px] text-left"
              />
            </div>
            <button
              type="button"
              onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))}
              className="h-9 rounded-lg text-red-500 hover:bg-red-50 flex items-center justify-center"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addRow}
        className="flex items-center gap-1 text-[12px] font-bold"
        style={{ color: "var(--color-emerald)" }}
      >
        <Plus className="w-3.5 h-3.5" /> افزودن آیتم فرمول
      </button>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="w-full py-3 rounded-xl font-black text-white disabled:opacity-60"
        style={{ backgroundColor: "var(--color-emerald)" }}
      >
        {saving ? (
          <Loader2 className="w-5 h-5 animate-spin mx-auto" />
        ) : (
          "ذخیره فرمول"
        )}
      </button>

      <div className="border-t border-gray-100 pt-4 space-y-3">
        <p className="text-[12px] font-bold text-gray-500">
          پیش‌نمایش قیمت نهایی
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            step="0.01"
            dir="ltr"
            value={previewWeight}
            onChange={(e) => setPreviewWeight(Number(e.target.value))}
            className="w-24 px-2 py-2 rounded-lg border border-gray-200 text-[12px] text-left"
          />
          <span className="text-[11px] text-gray-400">گرم</span>
          <button
            type="button"
            onClick={runPreview}
            disabled={previewLoading}
            className="px-3 py-2 rounded-lg text-[12px] font-bold border border-gray-200"
          >
            {previewLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "محاسبه"
            )}
          </button>
        </div>

        {previewResult && (
          <div
            className="text-[12px] space-y-1.5 p-3 rounded-xl"
            style={{ backgroundColor: "var(--color-bg-page)" }}
          >
            {previewResult.goldPricePerGramRial && (
              <div className="flex justify-between text-gray-500">
                <span>قیمت هر گرم طلا (عیار انتخابی)</span>
                <span dir="ltr">
                  {(
                    Number(previewResult.goldPricePerGramRial) / 10
                  ).toLocaleString("fa-IR")}{" "}
                  تومان
                </span>
              </div>
            )}
            <div className="flex justify-between text-gray-500">
              <span>ارزش پایهٔ طلا/محصول</span>
              <span dir="ltr">
                {(Number(previewResult.goldValueRial) / 10).toLocaleString(
                  "fa-IR",
                )}{" "}
                تومان
              </span>
            </div>
            {previewResult.lines.map((l) => (
              <div key={l.key} className="flex justify-between">
                <span>{l.label}</span>
                <span dir="ltr">
                  {(Number(l.amountRial) / 10).toLocaleString("fa-IR")} تومان
                </span>
              </div>
            ))}
            <div className="flex justify-between font-black pt-2 border-t border-gray-200">
              <span>قیمت نهایی (هر واحد)</span>
              <span dir="ltr" style={{ color: "var(--color-emerald)" }}>
                {(Number(previewResult.finalPriceRial) / 10).toLocaleString(
                  "fa-IR",
                )}{" "}
                تومان
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
