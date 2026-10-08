// admin/app/(dashboard)/shop/labels/page.tsx
//
// برچسب ارسال و لیبل پرینتر: طرح‌های برچسب (طراحی محتوا)، اندازه‌های استاندارد رول برچسب،
// بارکد EAN-13 کالاها و مشخصات فرستنده.
"use client";
import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Pencil, Plus, Printer, Search, Star, Trash2, Wand2 } from "lucide-react";
import {
  ActionButton,
  Alert,
  Empty,
  Field,
  Modal,
  PageHeader,
  Pagination,
  Spinner,
  Table,
  Tabs,
  api,
  cardStyle,
  fetcher,
  inputCls,
  useAction,
} from "@/app/components/finance/ui";
import { LabelPreview } from "@/app/components/labels/LabelPreview";
import { BarcodeSvg } from "@/app/components/labels/LabelView";
import { PrinterGuide } from "@/app/components/labels/PrinterGuide";
import { completeEan13 } from "@/app/components/labels/barcode";
import { REPEAT_FA, type LabelRepeat, type LabelSize, type LabelTemplate } from "@/app/components/labels/types";

type Tab = "templates" | "sizes" | "barcodes" | "settings";

export default function LabelsPage() {
  const [tab, setTab] = useState<Tab>("templates");
  return (
    <div className="space-y-4" dir="rtl">
      <PageHeader
        icon={Printer}
        title="برچسب ارسال و لیبل پرینتر"
        subtitle="محتوای برچسب (نشانی، مشخصات خریدار، بارکد EAN-13 کالا و ...) را طراحی و اندازه‌های رول برچسب دستگاه را تعریف کنید. کاربر انبار هنگام ارسال سفارش از صفحه‌ی سفارشات برچسب را چاپ می‌کند."
      />
      <Tabs<Tab>
        tabs={[
          { key: "templates", label: "طرح‌های برچسب" },
          { key: "sizes", label: "اندازه‌های برچسب" },
          { key: "barcodes", label: "بارکد کالاها" },
          { key: "settings", label: "فرستنده و تنظیمات" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "templates" && <TemplatesTab />}
      {tab === "sizes" && <SizesTab />}
      {tab === "barcodes" && <BarcodesTab />}
      {tab === "settings" && <SettingsTab />}
    </div>
  );
}

// ═══════════════════════════ طرح‌ها ═══════════════════════════

function TemplatesTab() {
  const { data, isLoading, mutate } = useSWR<LabelTemplate[]>("/api/admin/shop-labels/templates", fetcher);
  const [creating, setCreating] = useState(false);
  const act = useAction();
  const run = async (fn: () => Promise<unknown>, confirmText?: string) => {
    if (await act.run(fn, confirmText)) void mutate();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton onClick={() => setCreating(true)}>
          <Plus className="w-4 h-4" /> طرح جدید
        </ActionButton>
      </div>
      {act.error && <Alert kind="error" text={act.error} />}
      {isLoading || !data ? (
        <Spinner />
      ) : data.length === 0 ? (
        <Empty text="طرح برچسبی تعریف نشده است" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.map((t) => (
            <div key={t.id} className="rounded-2xl p-4 space-y-3" style={cardStyle}>
              <div className="flex justify-center py-2 bg-gray-50 rounded-xl">
                <LabelPreview template={t} maxWidthPx={260} maxHeightPx={220} />
              </div>
              <div>
                <p className="font-black text-[13px] flex items-center gap-1.5">
                  {t.isDefault && <Star className="w-4 h-4 text-amber-500 fill-amber-400" />}
                  {t.name}
                  {!t.isActive && <span className="badge bg-gray-100 text-gray-500">غیرفعال</span>}
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {t.size.name} — {REPEAT_FA[t.repeat]}
                </p>
                {t.description && <p className="text-[11px] text-gray-400 mt-0.5">{t.description}</p>}
              </div>
              <div className="flex flex-wrap gap-2 text-[12px] font-bold">
                <Link href={`/shop/labels/${t.id}`} className="flex items-center gap-1 text-emerald-700">
                  <Pencil className="w-3.5 h-3.5" /> طراحی
                </Link>
                <a href={`/labels/print?sample=1&template=${t.id}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-gray-600">
                  <Printer className="w-3.5 h-3.5" /> چاپ آزمایشی
                </a>
                <button type="button" onClick={() => void run(() => api.post(`/api/admin/shop-labels/templates/${t.id}/duplicate`))} className="flex items-center gap-1 text-gray-600">
                  <Copy className="w-3.5 h-3.5" /> کپی
                </button>
                {!t.isDefault && (
                  <button type="button" onClick={() => void run(() => api.patch(`/api/admin/shop-labels/templates/${t.id}`, { isDefault: true, isActive: true }))} className="flex items-center gap-1 text-amber-700">
                    <Star className="w-3.5 h-3.5" /> پیش‌فرض
                  </button>
                )}
                <button type="button" onClick={() => void run(() => api.patch(`/api/admin/shop-labels/templates/${t.id}`, { isActive: !t.isActive }))} className="text-gray-600">
                  {t.isActive ? "غیرفعال‌سازی" : "فعال‌سازی"}
                </button>
                <button
                  type="button"
                  onClick={() => void run(() => api.delete(`/api/admin/shop-labels/templates/${t.id}`), `طرح «${t.name}» حذف شود؟`)}
                  className="flex items-center gap-1 text-red-600"
                >
                  <Trash2 className="w-3.5 h-3.5" /> حذف
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {creating && <NewTemplateModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewTemplateModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { data: sizes } = useSWR<LabelSize[]>("/api/admin/shop-labels/sizes", fetcher);
  const [name, setName] = useState("");
  const [sizeId, setSizeId] = useState("");
  const [repeat, setRepeat] = useState<LabelRepeat>("ITEM");
  const act = useAction();
  const create = async () => {
    let id = "";
    const ok = await act.run(async () => {
      const res = await api.post<LabelTemplate>("/api/admin/shop-labels/templates", { name, sizeId, repeat, elements: [] });
      id = res.data.id;
      return res;
    });
    if (ok && id) router.push(`/shop/labels/${id}`);
  };
  return (
    <Modal title="طرح برچسب جدید" onClose={onClose}>
      <div className="space-y-3">
        <Field label="نام طرح">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="مثلاً برچسب پست پیشتاز" />
        </Field>
        <Field label="اندازه برچسب">
          <select value={sizeId} onChange={(e) => setSizeId(e.target.value)} className={inputCls}>
            <option value="">انتخاب کنید</option>
            {(sizes ?? [])
              .filter((s) => s.isActive)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.widthMm}×{s.heightMm} میلی‌متر)
                </option>
              ))}
          </select>
        </Field>
        <Field label="تعداد برچسب">
          <select value={repeat} onChange={(e) => setRepeat(e.target.value as LabelRepeat)} className={inputCls}>
            {Object.entries(REPEAT_FA).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        {act.error && <Alert kind="error" text={act.error} />}
        <ActionButton busy={act.busy} disabled={name.trim().length < 2 || !sizeId} onClick={() => void create()}>
          ساخت و رفتن به طراحی
        </ActionButton>
      </div>
    </Modal>
  );
}

// ═══════════════════════════ اندازه‌ها ═══════════════════════════

function SizesTab() {
  const { data, isLoading, mutate } = useSWR<LabelSize[]>("/api/admin/shop-labels/sizes", fetcher);
  const [edit, setEdit] = useState<LabelSize | "new" | null>(null);
  const act = useAction();
  return (
    <div className="space-y-3">
      <ActionButton onClick={() => setEdit("new")}>
        <Plus className="w-4 h-4" /> اندازه جدید
      </ActionButton>
      {act.error && <Alert kind="error" text={act.error} />}
      <div className="rounded-2xl p-4" style={cardStyle}>
        {isLoading || !data ? (
          <Spinner />
        ) : data.length === 0 ? (
          <Empty text="اندازه‌ای تعریف نشده است" />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>نام</th>
                <th>پهنا × ارتفاع (میلی‌متر)</th>
                <th>DPI دستگاه</th>
                <th>طرح‌ها</th>
                <th>وضعیت</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id}>
                  <td className="font-bold">{s.name}</td>
                  <td dir="ltr" className="text-right">
                    {s.widthMm} × {s.heightMm}
                  </td>
                  <td>{s.dpi}</td>
                  <td>{(s.templateCount ?? 0).toLocaleString("fa-IR")}</td>
                  <td>
                    <span className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${s.isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {s.isActive ? "فعال" : "غیرفعال"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap">
                    <button type="button" onClick={() => setEdit(s)} className="text-emerald-700 font-bold text-[12px] ml-3">
                      ویرایش
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (await act.run(() => api.delete(`/api/admin/shop-labels/sizes/${s.id}`), `اندازه «${s.name}» حذف شود؟`)) void mutate();
                      }}
                      className="text-red-600 font-bold text-[12px]"
                    >
                      حذف
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
      {edit && (
        <SizeModal
          size={edit === "new" ? null : edit}
          onClose={() => {
            setEdit(null);
            void mutate();
          }}
        />
      )}
    </div>
  );
}

function SizeModal({ size, onClose }: { size: LabelSize | null; onClose: () => void }) {
  const [f, setF] = useState({
    name: size?.name ?? "",
    widthMm: String(size?.widthMm ?? ""),
    heightMm: String(size?.heightMm ?? ""),
    dpi: size?.dpi ?? 203,
    isActive: size?.isActive ?? true,
    sortOrder: String(size?.sortOrder ?? 0),
  });
  const act = useAction();
  const save = async () => {
    const body = {
      name: f.name,
      widthMm: Number(f.widthMm),
      heightMm: Number(f.heightMm),
      dpi: f.dpi,
      isActive: f.isActive,
      sortOrder: Number(f.sortOrder) || 0,
    };
    const ok = await act.run(() => (size ? api.patch(`/api/admin/shop-labels/sizes/${size.id}`, body) : api.post("/api/admin/shop-labels/sizes", body)));
    if (ok) onClose();
  };
  const num = (v: string) => v.replace(/[^\d.]/g, "");
  return (
    <Modal title={size ? `ویرایش ${size.name}` : "اندازه برچسب جدید"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="نام">
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} placeholder="مثلاً ۱۰۰×۷۵" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="پهنا (میلی‌متر)">
            <input value={f.widthMm} onChange={(e) => setF({ ...f, widthMm: num(e.target.value) })} className={inputCls} inputMode="decimal" dir="ltr" />
          </Field>
          <Field label="ارتفاع (میلی‌متر)">
            <input value={f.heightMm} onChange={(e) => setF({ ...f, heightMm: num(e.target.value) })} className={inputCls} inputMode="decimal" dir="ltr" />
          </Field>
          <Field label="تفکیک‌پذیری دستگاه (DPI)" hint="بیشتر لیبل پرینترهای حرارتی ۲۰۳ هستند؛ مدل‌های دقیق‌تر ۳۰۰">
            <select value={f.dpi} onChange={(e) => setF({ ...f, dpi: Number(e.target.value) })} className={inputCls}>
              {[152, 203, 300, 600].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
          <Field label="ترتیب نمایش">
            <input value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: e.target.value.replace(/\D/g, "") })} className={inputCls} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-[12px] font-bold">
          <input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} /> فعال
        </label>
        {size && (size.templateCount ?? 0) > 0 && (
          <Alert kind="info" text="با تغییر ابعاد، عناصری که از کادر جدید بیرون بزنند به داخل برچسب منتقل می‌شوند؛ طرح‌ها را پس از تغییر بازبینی کنید." />
        )}
        {act.error && <Alert kind="error" text={act.error} />}
        <ActionButton busy={act.busy} disabled={!f.name || !Number(f.widthMm) || !Number(f.heightMm)} onClick={() => void save()}>
          ذخیره
        </ActionButton>
      </div>
    </Modal>
  );
}

// ═══════════════════════════ بارکد کالاها ═══════════════════════════

interface BarcodeRow {
  target: "PRODUCT" | "VARIANT";
  id: string;
  productId: string;
  productName: string;
  label: string;
  sku: string | null;
  barcode: string | null;
  status: string;
}
interface BarcodeResp {
  data: BarcodeRow[];
  page: number;
  total: number;
  totalPages: number;
}

function BarcodesTab() {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [missing, setMissing] = useState(false);
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ page: String(page) });
  if (search) qs.set("q", search);
  if (missing) qs.set("missing", "true");
  const { data, isLoading, mutate } = useSWR<BarcodeResp>(`/api/admin/shop-labels/barcodes?${qs.toString()}`, fetcher);
  const act = useAction();

  return (
    <div className="space-y-3">
      <Alert
        kind="info"
        text="بارکد EAN-13 هر کالا روی برچسب چاپ می‌شود. اگر کالا بارکد رسمی (مثلاً از GS1 ایران با پیشوند ۶۲۶) دارد وارد کنید؛ در غیر این صورت «ساخت بارکد برای کالاهای بدون بارکد» بارکد داخلی با پیشوند تنظیمات می‌سازد. ۱۲ رقم وارد کنید تا رقم کنترل خودکار اضافه شود."
      />
      <div className="flex flex-wrap items-end gap-2">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(q.trim());
            setPage(1);
          }}
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="نام کالا، SKU یا بارکد" className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white w-60" />
          <button type="submit" className="px-3 py-2 rounded-xl border border-gray-200 bg-white">
            <Search className="w-4 h-4" />
          </button>
        </form>
        <label className="flex items-center gap-2 text-[12px] font-bold text-gray-600 px-2 py-2">
          <input
            type="checkbox"
            checked={missing}
            onChange={(e) => {
              setMissing(e.target.checked);
              setPage(1);
            }}
          />
          فقط کالاهای بدون بارکد
        </label>
        <ActionButton
          variant="secondary"
          busy={act.busy}
          onClick={async () => {
            if (await act.run(() => api.post("/api/admin/shop-labels/barcodes/generate", {}), "برای همه‌ی کالاهای بدون بارکد، بارکد داخلی ساخته شود؟")) void mutate();
          }}
        >
          <Wand2 className="w-4 h-4" /> ساخت بارکد برای کالاهای بدون بارکد
        </ActionButton>
      </div>
      {act.error && <Alert kind="error" text={act.error} />}
      {act.success && <Alert kind="success" text={act.success} />}
      <div className="rounded-2xl p-4" style={cardStyle}>
        {isLoading || !data ? (
          <Spinner />
        ) : data.data.length === 0 ? (
          <Empty text="کالایی یافت نشد" />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>کالا</th>
                <th>تنوع</th>
                <th>SKU</th>
                <th>بارکد EAN-13</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.data.map((r) => (
                <BarcodeRowView key={`${r.target}-${r.id}`} row={r} onSaved={() => void mutate()} />
              ))}
            </tbody>
          </Table>
        )}
        {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />}
      </div>
    </div>
  );
}

function BarcodeRowView({ row, onSaved }: { row: BarcodeRow; onSaved: () => void }) {
  const [value, setValue] = useState(row.barcode ?? "");
  const act = useAction();
  const dirty = value !== (row.barcode ?? "");
  const preview = completeEan13(value);
  return (
    <tr>
      <td className="font-bold">{row.productName}</td>
      <td>{row.label}</td>
      <td dir="ltr" className="text-right">
        {row.sku ?? "—"}
      </td>
      <td>
        <div className="flex items-center gap-3">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            dir="ltr"
            inputMode="numeric"
            maxLength={17}
            placeholder="۱۲ یا ۱۳ رقم"
            className={`w-40 px-2 py-1.5 rounded-lg border text-[12px] font-mono ${value && !preview ? "border-red-300" : "border-gray-200"}`}
          />
          {preview && (
            <div className="hidden sm:block">
              <BarcodeSvg format="EAN13" value={preview} widthMm={30} heightMm={11} dpi={300} showText fontSizePt={6} />
            </div>
          )}
        </div>
        {act.error && <p className="text-[11px] text-red-600 mt-1">{act.error}</p>}
      </td>
      <td>
        {dirty && (
          <button
            type="button"
            disabled={act.busy || (!!value && !preview)}
            onClick={async () => {
              if (await act.run(() => api.put("/api/admin/shop-labels/barcodes", { target: row.target, id: row.id, barcode: value || null }))) onSaved();
            }}
            className="text-emerald-700 font-bold text-[12px] disabled:opacity-40"
          >
            ذخیره
          </button>
        )}
      </td>
    </tr>
  );
}

// ═══════════════════════════ تنظیمات ═══════════════════════════

interface LabelSettings {
  senderName: string;
  senderPhone: string;
  senderAddress: string;
  senderPostalCode: string;
  eanPrefix: string;
  autoAssignBarcode: boolean;
}

function SettingsTab() {
  const { data, mutate } = useSWR<LabelSettings>("/api/admin/shop-labels/settings", fetcher);
  if (!data) return <Spinner />;
  return <SettingsForm initial={data} onSaved={() => void mutate()} />;
}

function SettingsForm({ initial, onSaved }: { initial: LabelSettings; onSaved: () => void }) {
  const [f, setF] = useState(initial);
  const act = useAction();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl p-4 space-y-3" style={cardStyle}>
        <p className="font-black text-[13px]">مشخصات فرستنده (روی برچسب)</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="نام فرستنده">
            <input value={f.senderName} onChange={(e) => setF({ ...f, senderName: e.target.value })} className={inputCls} />
          </Field>
          <Field label="تلفن">
            <input value={f.senderPhone} onChange={(e) => setF({ ...f, senderPhone: e.target.value })} className={inputCls} dir="ltr" />
          </Field>
        </div>
        <Field label="نشانی">
          <input value={f.senderAddress} onChange={(e) => setF({ ...f, senderAddress: e.target.value })} className={inputCls} />
        </Field>
        <Field label="کدپستی">
          <input value={f.senderPostalCode} onChange={(e) => setF({ ...f, senderPostalCode: e.target.value })} className={inputCls} dir="ltr" />
        </Field>
        <p className="font-black text-[13px] pt-2">بارکد کالا</p>
        <Field label="پیشوند بارکد داخلی" hint="۲ تا ۹ رقم. ۲۰۰ تا ۲۹۹ برای مصرف داخلی فروشگاه رزرو است؛ اگر کد شرکت از GS1 ایران دارید (۶۲۶...) همان را وارد کنید.">
          <input value={f.eanPrefix} onChange={(e) => setF({ ...f, eanPrefix: e.target.value.replace(/\D/g, "").slice(0, 9) })} className={inputCls} dir="ltr" />
        </Field>
        <label className="flex items-start gap-2 text-[12px]">
          <input type="checkbox" className="mt-1" checked={f.autoAssignBarcode} onChange={(e) => setF({ ...f, autoAssignBarcode: e.target.checked })} />
          <span>
            <span className="font-bold">ساخت خودکار بارکد هنگام چاپ</span>
            <span className="block text-gray-400">اگر کالای سفارش بارکد نداشته باشد، پیش از چاپ برچسب بارکد داخلی برایش ساخته و ذخیره می‌شود.</span>
          </span>
        </label>
        {act.error && <Alert kind="error" text={act.error} />}
        {act.success && <Alert kind="success" text={act.success} />}
        <ActionButton
          busy={act.busy}
          onClick={async () => {
            if (await act.run(() => api.put("/api/admin/shop-labels/settings", f))) onSaved();
          }}
        >
          ذخیره تنظیمات
        </ActionButton>
      </div>
      <PrinterGuide />
    </div>
  );
}
