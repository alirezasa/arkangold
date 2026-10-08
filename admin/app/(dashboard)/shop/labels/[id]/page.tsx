// admin/app/(dashboard)/shop/labels/[id]/page.tsx
//
// طراح برچسب: افزودن متن، بارکد، فهرست اقلام، خط، کادر و لوگو؛ جابه‌جایی با کشیدن یا کلیدهای جهت،
// تغییر اندازه با دستگیره‌ی گوشه، درج فیلدهای سفارش و پیش‌نمایش زنده با داده‌ی نمونه.
"use client";
import { use, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import {
  ArrowRight,
  Barcode,
  ChevronDown,
  ChevronUp,
  Copy,
  Image as ImageIcon,
  List,
  Minus,
  Printer,
  Save,
  Square,
  Trash2,
  Type,
} from "lucide-react";
import { ActionButton, Alert, Field, Spinner, api, cardStyle, fetcher, inputCls, useAction } from "@/app/components/finance/ui";
import { LabelView, barcodeFitWarning } from "@/app/components/labels/LabelView";
import { PX_PER_MM } from "@/app/components/labels/LabelPreview";
import { BARCODE_SOURCES, FIELD_GROUPS, SAMPLE_DATA, buildLabels, fillTemplate } from "@/app/components/labels/fields";
import {
  ELEMENT_FA,
  REPEAT_FA,
  type LabelElement,
  type LabelElementType,
  type LabelRepeat,
  type LabelSize,
  type LabelTemplate,
} from "@/app/components/labels/types";

const GRID_MM = 0.5;
const MAX_IMAGE_CHARS = 190_000;

const snap = (v: number) => Math.round(v / GRID_MM) * GRID_MM;
const round1 = (v: number) => Math.round(v * 10) / 10;
const newId = () => `el${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

interface Draft {
  name: string;
  description: string;
  repeat: LabelRepeat;
  sizeId: string;
  isDefault: boolean;
  isActive: boolean;
  elements: LabelElement[];
}

function makeElement(type: LabelElementType, W: number, H: number): LabelElement {
  const base = { id: newId(), x: 2, y: 2 };
  const w = (v: number) => Math.min(v, W - 4);
  const h = (v: number) => Math.min(v, H - 4);
  switch (type) {
    case "text":
      return { ...base, type, w: w(40), h: h(6), content: "متن {{receiver.name}}", fontSize: 10, bold: false, align: "right", valign: "top", dir: "rtl", invert: false, border: false };
    case "barcode":
      return { ...base, type, w: w(50), h: h(20), format: "EAN13", source: "{{item.barcode}}", showText: true, fontSize: 8 };
    case "items":
      return { ...base, type, w: w(W - 4), h: h(25), fontSize: 8, showWeight: true, showBarcode: false };
    case "line":
      return { ...base, type, w: w(W - 4), h: 1, thickness: 0.4 };
    case "box":
      return { ...base, type, w: w(30), h: h(15), thickness: 0.3, radius: 0, fill: false };
    case "image":
      return { ...base, type, w: w(20), h: h(10), src: "" };
  }
}

/** کوچک‌سازی تصویر و تبدیل به data URL تا طرح سبک بماند */
async function fileToDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new window.Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("تصویر خوانده نشد"));
      i.src = url;
    });
    const scale = Math.min(1, 600 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("مرورگر از پردازش تصویر پشتیبانی نمی‌کند");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    let data = canvas.toDataURL("image/png");
    if (data.length > MAX_IMAGE_CHARS) data = canvas.toDataURL("image/jpeg", 0.85);
    if (data.length > MAX_IMAGE_CHARS) throw new Error("تصویر بزرگ است؛ لوگوی ساده‌تر یا کوچک‌تری انتخاب کنید");
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function LabelDesignerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: template, mutate } = useSWR<LabelTemplate>(`/api/admin/shop-labels/templates/${id}`, fetcher);
  const { data: sizes } = useSWR<LabelSize[]>("/api/admin/shop-labels/sizes", fetcher);
  if (!template || !sizes) return <Spinner />;
  return <Designer key={template.id} template={template} sizes={sizes} onSaved={() => void mutate()} />;
}

function Designer({ template, sizes, onSaved }: { template: LabelTemplate; sizes: LabelSize[]; onSaved: () => void }) {
  const [draft, setDraft] = useState<Draft>({
    name: template.name,
    description: template.description ?? "",
    repeat: template.repeat,
    sizeId: template.sizeId,
    isDefault: template.isDefault,
    isActive: template.isActive,
    elements: template.elements,
  });
  const [dirty, setDirty] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSample, setShowSample] = useState(true);
  const act = useAction();

  const size = sizes.find((s) => s.id === draft.sizeId) ?? template.size;
  const W = size.widthMm;
  const H = size.heightMm;
  const [zoom, setZoom] = useState(() => Math.min(5, Math.max(1, 520 / (W * PX_PER_MM))));
  const selected = draft.elements.find((e) => e.id === selectedId) ?? null;
  const sampleLabel = useMemo(() => buildLabels(SAMPLE_DATA, draft.repeat)[0], [draft.repeat]);

  const update = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };
  const updateEl = (elId: string, patch: Partial<LabelElement>) => {
    setDraft((d) => ({
      ...d,
      elements: d.elements.map((e) => {
        if (e.id !== elId) return e;
        const next = { ...e, ...patch } as LabelElement;
        next.w = round1(Math.min(Math.max(1, next.w), W));
        next.h = round1(Math.min(Math.max(0.5, next.h), H));
        next.x = round1(Math.min(Math.max(0, next.x), W - next.w));
        next.y = round1(Math.min(Math.max(0, next.y), H - next.h));
        return next;
      }),
    }));
    setDirty(true);
  };
  const addEl = (type: LabelElementType) => {
    const el = makeElement(type, W, H);
    update({ elements: [...draft.elements, el] });
    setSelectedId(el.id);
  };
  const removeEl = (elId: string) => {
    update({ elements: draft.elements.filter((e) => e.id !== elId) });
    setSelectedId(null);
  };
  const duplicateEl = (el: LabelElement) => {
    const copy = { ...el, id: newId(), x: Math.min(el.x + 2, W - el.w), y: Math.min(el.y + 2, H - el.h) };
    update({ elements: [...draft.elements, copy] });
    setSelectedId(copy.id);
  };
  const moveLayer = (elId: string, dir: -1 | 1) => {
    const i = draft.elements.findIndex((e) => e.id === elId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= draft.elements.length) return;
    const list = [...draft.elements];
    [list[i], list[j]] = [list[j], list[i]];
    update({ elements: list });
  };

  const save = async () => {
    const ok = await act.run(() =>
      api.patch(`/api/admin/shop-labels/templates/${template.id}`, {
        name: draft.name,
        description: draft.description || null,
        repeat: draft.repeat,
        sizeId: draft.sizeId,
        isDefault: draft.isDefault,
        isActive: draft.isActive,
        elements: draft.elements,
      }),
    );
    if (ok) {
      setDirty(false);
      onSaved();
    }
  };

  // هشدار خروج بدون ذخیره
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // ── کشیدن و تغییر اندازه ──
  const drag = useRef<{ id: string; mode: "move" | "resize"; sx: number; sy: number; ox: number; oy: number; ow: number; oh: number } | null>(null);
  const pxPerMm = PX_PER_MM * zoom;
  const onPointerDown = (e: React.PointerEvent, el: LabelElement, mode: "move" | "resize") => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(el.id);
    drag.current = { id: el.id, mode, sx: e.clientX, sy: e.clientY, ox: el.x, oy: el.y, ow: el.w, oh: el.h };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / pxPerMm;
    const dy = (e.clientY - d.sy) / pxPerMm;
    if (d.mode === "move") updateEl(d.id, { x: snap(d.ox + dx), y: snap(d.oy + dy) });
    else updateEl(d.id, { w: snap(d.ow + dx), h: snap(d.oh + dy) });
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!selected) return;
    const step = e.shiftKey ? 5 : GRID_MM;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      updateEl(selected.id, { x: selected.x + moves[e.key][0], y: selected.y + moves[e.key][1] });
    } else if (e.key === "Delete") {
      e.preventDefault();
      removeEl(selected.id);
    }
  };

  const tools: { type: LabelElementType; icon: typeof Type }[] = [
    { type: "text", icon: Type },
    { type: "barcode", icon: Barcode },
    { type: "items", icon: List },
    { type: "line", icon: Minus },
    { type: "box", icon: Square },
    { type: "image", icon: ImageIcon },
  ];

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/shop/labels" className="flex items-center gap-1 text-[12px] font-bold text-gray-500">
          <ArrowRight className="w-4 h-4" /> طرح‌ها
        </Link>
        <h1 className="text-[16px] font-black">طراحی برچسب: {draft.name}</h1>
        <div className="mr-auto flex flex-wrap gap-2">
          <a
            href={`/labels/print?sample=1&template=${template.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-bold border-2 border-gray-200 bg-white text-gray-700"
            title={dirty ? "ابتدا تغییرات را ذخیره کنید" : undefined}
          >
            <Printer className="w-4 h-4" /> چاپ آزمایشی
          </a>
          <ActionButton busy={act.busy} disabled={!dirty || draft.name.trim().length < 2} onClick={() => void save()}>
            <Save className="w-4 h-4" /> ذخیره{dirty ? " *" : ""}
          </ActionButton>
        </div>
      </div>
      {act.error && <Alert kind="error" text={act.error} />}
      {act.success && !dirty && <Alert kind="success" text={act.success} />}

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        {/* ── بوم طراحی ── */}
        <div className="rounded-2xl p-4 space-y-3 min-w-0" style={cardStyle}>
          <div className="flex flex-wrap items-center gap-2">
            {tools.map((t) => (
              <button
                key={t.type}
                type="button"
                onClick={() => addEl(t.type)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-[12px] font-bold text-gray-700 hover:border-emerald-600"
              >
                <t.icon className="w-4 h-4" /> {ELEMENT_FA[t.type]}
              </button>
            ))}
            <div className="mr-auto flex items-center gap-3 text-[12px] text-gray-600">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={showSample} onChange={(e) => setShowSample(e.target.checked)} /> داده‌ی نمونه
              </label>
              <label className="flex items-center gap-1.5">
                بزرگ‌نمایی
                <input type="range" min={1} max={6} step={0.25} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
              </label>
            </div>
          </div>

          <div className="overflow-auto bg-gray-100 rounded-xl p-6 flex justify-center">
            <div
              dir="ltr"
              tabIndex={0}
              onKeyDown={onKeyDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerDown={() => setSelectedId(null)}
              className="relative outline-none shrink-0 shadow-md bg-white"
              style={{ width: W * pxPerMm, height: H * pxPerMm }}
            >
              <div style={{ position: "absolute", top: 0, left: 0, transform: `scale(${zoom})`, transformOrigin: "top left", pointerEvents: "none" }}>
                <LabelView
                  widthMm={W}
                  heightMm={H}
                  dpi={size.dpi}
                  elements={draft.elements}
                  ctx={showSample ? (sampleLabel?.ctx ?? null) : null}
                  items={sampleLabel?.order.items ?? []}
                />
              </div>
              {draft.elements.map((el) => {
                const active = el.id === selectedId;
                return (
                  <div
                    key={el.id}
                    onPointerDown={(e) => onPointerDown(e, el, "move")}
                    className={`absolute cursor-move ${active ? "ring-2 ring-emerald-500" : "hover:ring-1 hover:ring-emerald-300"}`}
                    style={{ left: el.x * pxPerMm, top: el.y * pxPerMm, width: el.w * pxPerMm, height: el.h * pxPerMm }}
                  >
                    {active && (
                      <span
                        onPointerDown={(e) => onPointerDown(e, el, "resize")}
                        className="absolute -right-1.5 -bottom-1.5 w-3 h-3 rounded-sm bg-emerald-600 cursor-nwse-resize"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <p className="text-[11px] text-gray-400">
            {W}×{H} میلی‌متر — عنصر را بکشید یا با کلیدهای جهت (Shift = ۵ میلی‌متر) جابه‌جا کنید؛ Delete حذف می‌کند. متن طولانی (مثل نشانی) خودکار کوچک می‌شود تا در کادر جا شود.
          </p>

          {/* لایه‌ها */}
          <div className="space-y-1">
            {draft.elements.map((el, i) => (
              <div
                key={el.id}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] cursor-pointer ${el.id === selectedId ? "bg-emerald-50" : "hover:bg-gray-50"}`}
                onClick={() => setSelectedId(el.id)}
              >
                <span className="font-bold w-20 shrink-0">{ELEMENT_FA[el.type]}</span>
                <span className="text-gray-500 truncate flex-1">
                  {el.type === "text" ? el.content : el.type === "barcode" ? `${el.format} ${el.source}` : ""}
                </span>
                <button type="button" disabled={i === 0} onClick={() => moveLayer(el.id, -1)} className="text-gray-400 disabled:opacity-30" title="به عقب">
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button type="button" disabled={i === draft.elements.length - 1} onClick={() => moveLayer(el.id, 1)} className="text-gray-400 disabled:opacity-30" title="به جلو">
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ── ویژگی‌ها ── */}
        <div className="space-y-4">
          {selected ? (
            <ElementPanel
              key={selected.id}
              el={selected}
              dpi={size.dpi}
              onChange={(p) => updateEl(selected.id, p)}
              onDelete={() => removeEl(selected.id)}
              onDuplicate={() => duplicateEl(selected)}
            />
          ) : (
            <div className="rounded-2xl p-4 text-[12px] text-gray-500" style={cardStyle}>
              عنصری را روی برچسب انتخاب کنید یا از نوار بالا اضافه کنید.
            </div>
          )}

          <div className="rounded-2xl p-4 space-y-3" style={cardStyle}>
            <p className="font-black text-[13px]">مشخصات طرح</p>
            <Field label="نام طرح">
              <input value={draft.name} onChange={(e) => update({ name: e.target.value })} className={inputCls} />
            </Field>
            <Field label="توضیح">
              <input value={draft.description} onChange={(e) => update({ description: e.target.value })} className={inputCls} />
            </Field>
            <Field label="اندازه برچسب" hint="با تغییر اندازه، عناصر بیرون‌زده هنگام ذخیره به داخل برچسب منتقل می‌شوند">
              <select value={draft.sizeId} onChange={(e) => update({ sizeId: e.target.value })} className={inputCls}>
                {sizes.map((s) => (
                  <option key={s.id} value={s.id} disabled={!s.isActive && s.id !== draft.sizeId}>
                    {s.name} ({s.widthMm}×{s.heightMm})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="تعداد برچسب">
              <select value={draft.repeat} onChange={(e) => update({ repeat: e.target.value as LabelRepeat })} className={inputCls}>
                {Object.entries(REPEAT_FA).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-[12px] font-bold">
              <input type="checkbox" checked={draft.isDefault} onChange={(e) => update({ isDefault: e.target.checked })} /> طرح پیش‌فرض چاپ
            </label>
            <label className="flex items-center gap-2 text-[12px] font-bold">
              <input type="checkbox" checked={draft.isActive} onChange={(e) => update({ isActive: e.target.checked })} /> فعال
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════ پنل ویژگی‌های عنصر ═══════════════════════════

function NumInput({ label, value, onChange, step = 0.5, min = 0 }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold text-gray-500">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        className="w-full mt-0.5 px-2 py-1.5 rounded-lg border border-gray-200 text-[12px] bg-white"
        dir="ltr"
      />
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-[12px] font-bold">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  );
}

function FieldInserter({ onInsert }: { onInsert: (token: string) => void }) {
  return (
    <select
      value=""
      onChange={(e) => {
        if (e.target.value) onInsert(`{{${e.target.value}}}`);
      }}
      className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-[12px] bg-white"
    >
      <option value="">+ درج فیلد سفارش…</option>
      {FIELD_GROUPS.map((g) => (
        <optgroup key={g.title} label={g.title}>
          {g.fields.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function ElementPanel({
  el,
  dpi,
  onChange,
  onDelete,
  onDuplicate,
}: {
  el: LabelElement;
  dpi: number;
  onChange: (p: Partial<LabelElement>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [imgError, setImgError] = useState("");
  const sampleCtx = buildLabels(SAMPLE_DATA, "ITEM")[0]?.ctx ?? null;

  const insertToken = (token: string) => {
    if (el.type !== "text") return;
    const node = textRef.current;
    const start = node?.selectionStart ?? el.content.length;
    const end = node?.selectionEnd ?? el.content.length;
    onChange({ content: el.content.slice(0, start) + token + el.content.slice(end) } as Partial<LabelElement>);
  };

  const fitWarning =
    el.type === "barcode" ? barcodeFitWarning(el.format, el.format === "EAN13" ? "2001234567893" : fillTemplate(el.source, sampleCtx) || "AG-1405-SHO-000128", el.w, dpi) : null;

  return (
    <div className="rounded-2xl p-4 space-y-3" style={cardStyle}>
      <div className="flex items-center gap-2">
        <p className="font-black text-[13px]">{ELEMENT_FA[el.type]}</p>
        <button type="button" onClick={onDuplicate} className="mr-auto text-gray-500" title="کپی">
          <Copy className="w-4 h-4" />
        </button>
        <button type="button" onClick={onDelete} className="text-red-600" title="حذف">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <NumInput label="X" value={el.x} onChange={(v) => onChange({ x: v })} />
        <NumInput label="Y" value={el.y} onChange={(v) => onChange({ y: v })} />
        <NumInput label="پهنا" value={el.w} onChange={(v) => onChange({ w: v })} min={1} />
        <NumInput label="ارتفاع" value={el.h} onChange={(v) => onChange({ h: v })} min={0.5} />
      </div>

      {el.type === "text" && (
        <>
          <Field label="متن">
            <textarea ref={textRef} value={el.content} onChange={(e) => onChange({ content: e.target.value })} rows={3} className={inputCls} />
          </Field>
          <FieldInserter onInsert={insertToken} />
          <div className="grid grid-cols-2 gap-2">
            <NumInput label="اندازه قلم (pt)" value={el.fontSize} onChange={(v) => onChange({ fontSize: v })} min={4} />
            <label className="block">
              <span className="text-[11px] font-bold text-gray-500">تراز افقی</span>
              <select value={el.align} onChange={(e) => onChange({ align: e.target.value as "right" })} className="w-full mt-0.5 px-2 py-1.5 rounded-lg border border-gray-200 text-[12px] bg-white">
                <option value="right">راست</option>
                <option value="center">وسط</option>
                <option value="left">چپ</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-bold text-gray-500">تراز عمودی</span>
              <select value={el.valign} onChange={(e) => onChange({ valign: e.target.value as "top" })} className="w-full mt-0.5 px-2 py-1.5 rounded-lg border border-gray-200 text-[12px] bg-white">
                <option value="top">بالا</option>
                <option value="middle">وسط</option>
                <option value="bottom">پایین</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-bold text-gray-500">جهت</span>
              <select value={el.dir} onChange={(e) => onChange({ dir: e.target.value as "rtl" })} className="w-full mt-0.5 px-2 py-1.5 rounded-lg border border-gray-200 text-[12px] bg-white">
                <option value="rtl">راست‌به‌چپ</option>
                <option value="ltr">چپ‌به‌راست</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-4">
            <Check label="درشت" checked={el.bold} onChange={(v) => onChange({ bold: v })} />
            <Check label="سفید روی مشکی" checked={el.invert} onChange={(v) => onChange({ invert: v })} />
            <Check label="قاب" checked={el.border} onChange={(v) => onChange({ border: v })} />
          </div>
        </>
      )}

      {el.type === "barcode" && (
        <>
          <Field label="نوع بارکد">
            <select value={el.format} onChange={(e) => onChange({ format: e.target.value as "EAN13" })} className={inputCls}>
              <option value="EAN13">EAN-13 (بارکد کالا)</option>
              <option value="CODE128">Code 128 (شماره سفارش، کدپستی، رهگیری)</option>
            </select>
          </Field>
          <Field label="مقدار">
            <select
              value={BARCODE_SOURCES.some((s) => s.value === el.source) ? el.source : ""}
              onChange={(e) => {
                const s = BARCODE_SOURCES.find((x) => x.value === e.target.value);
                if (s) onChange({ source: s.value, format: s.format });
              }}
              className={inputCls}
            >
              <option value="">مقدار دلخواه</option>
              {BARCODE_SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <input value={el.source} onChange={(e) => onChange({ source: e.target.value })} className={`${inputCls} text-left font-mono`} dir="ltr" />
          <div className="grid grid-cols-2 gap-2 items-end">
            <Check label="نمایش عدد زیر بارکد" checked={el.showText} onChange={(v) => onChange({ showText: v })} />
            <NumInput label="اندازه عدد (pt)" value={el.fontSize} onChange={(v) => onChange({ fontSize: v })} min={4} />
          </div>
          {fitWarning && <Alert kind="warn" text={fitWarning} />}
          <p className="text-[11px] text-gray-400">پهنای میله‌ها با تفکیک‌پذیری دستگاه ({dpi} DPI) هم‌تراز می‌شود؛ فضای سفید دو طرف بارکد را خالی نگه دارید.</p>
        </>
      )}

      {el.type === "items" && (
        <>
          <NumInput label="اندازه قلم (pt)" value={el.fontSize} onChange={(v) => onChange({ fontSize: v })} min={4} />
          <div className="flex flex-wrap gap-4">
            <Check label="وزن" checked={el.showWeight} onChange={(v) => onChange({ showWeight: v })} />
            <Check label="شماره بارکد" checked={el.showBarcode} onChange={(v) => onChange({ showBarcode: v })} />
          </div>
        </>
      )}

      {el.type === "line" && <NumInput label="ضخامت (میلی‌متر)" value={el.thickness} onChange={(v) => onChange({ thickness: v })} step={0.1} min={0.1} />}

      {el.type === "box" && (
        <div className="grid grid-cols-2 gap-2 items-end">
          <NumInput label="ضخامت قاب" value={el.thickness} onChange={(v) => onChange({ thickness: v })} step={0.1} min={0.1} />
          <NumInput label="گردی گوشه" value={el.radius} onChange={(v) => onChange({ radius: v })} />
          <Check label="توپر (مشکی)" checked={el.fill} onChange={(v) => onChange({ fill: v })} />
        </div>
      )}

      {el.type === "image" && (
        <>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setImgError("");
              try {
                onChange({ src: await fileToDataUrl(file) });
              } catch (err) {
                setImgError((err as Error).message);
              }
            }}
            className="text-[12px]"
          />
          {imgError && <Alert kind="error" text={imgError} />}
          <p className="text-[11px] text-gray-400">لوگوی سیاه‌وسفید با زمینه‌ی سفید روی چاپگر حرارتی بهترین نتیجه را دارد.</p>
        </>
      )}
    </div>
  );
}
