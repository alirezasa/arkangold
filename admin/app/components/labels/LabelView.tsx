// admin/app/components/labels/LabelView.tsx
//
// رندر یک برچسب با واحد میلی‌متر (CSS mm) — همان خروجی در پیش‌نمایش طراحی و صفحه‌ی چاپ.
// درایور دستگاه لیبل پرینتر صفحه را رستر می‌کند؛ پهنای میله‌های بارکد بر اساس DPI دستگاه
// به مضرب صحیح نقطه‌ی هد چاپ گرد می‌شود تا بارکد خوانا بماند.
"use client";
import { useLayoutEffect, useRef } from "react";
import { encodeBarcode, type BarcodeFormat } from "./barcode";
import { fillTemplate, type LabelContext } from "./fields";
import type { BarcodeElement, ItemsElement, LabelElement, PrintItem, TextElement } from "./types";

const PT_TO_MM = 25.4 / 72;
const MIN_FONT_PT = 4;

export function LabelView({
  widthMm,
  heightMm,
  dpi,
  elements,
  ctx,
  items,
}: {
  widthMm: number;
  heightMm: number;
  dpi: number;
  elements: LabelElement[];
  /** null = نمایش خام فیلدها (بدون داده) */
  ctx: LabelContext | null;
  items: PrintItem[];
}) {
  return (
    <div
      dir="ltr"
      style={{
        position: "relative",
        width: `${widthMm}mm`,
        height: `${heightMm}mm`,
        overflow: "hidden",
        background: "#fff",
        color: "#000",
      }}
    >
      {elements.map((el) => (
        <div
          key={el.id}
          style={{ position: "absolute", left: `${el.x}mm`, top: `${el.y}mm`, width: `${el.w}mm`, height: `${el.h}mm` }}
        >
          <ElementView el={el} ctx={ctx} items={items} dpi={dpi} />
        </div>
      ))}
    </div>
  );
}

function ElementView({ el, ctx, items, dpi }: { el: LabelElement; ctx: LabelContext | null; items: PrintItem[]; dpi: number }) {
  switch (el.type) {
    case "text":
      return <TextView el={el} text={fillTemplate(el.content, ctx)} />;
    case "barcode":
      return <BarcodeView el={el} value={fillTemplate(el.source, ctx)} dpi={dpi} raw={!ctx} />;
    case "items":
      return <ItemsView el={el} items={items} />;
    case "line": {
      const horizontal = el.w >= el.h;
      return (
        <div
          style={{
            position: "absolute",
            background: "#000",
            ...(horizontal
              ? { left: 0, right: 0, top: `calc(50% - ${el.thickness / 2}mm)`, height: `${el.thickness}mm` }
              : { top: 0, bottom: 0, left: `calc(50% - ${el.thickness / 2}mm)`, width: `${el.thickness}mm` }),
          }}
        />
      );
    }
    case "box":
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            boxSizing: "border-box",
            border: `${el.thickness}mm solid #000`,
            borderRadius: `${el.radius}mm`,
            background: el.fill ? "#000" : "transparent",
          }}
        />
      );
    case "image":
      return el.src ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URL داخل برچسب چاپی
        <img src={el.src} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      ) : (
        <div style={{ width: "100%", height: "100%", border: "0.2mm dashed #999" }} />
      );
  }
}

/** متن با کوچک‌شدن خودکار قلم تا در کادر جا شود (نشانی‌های بلند) */
function TextView({ el, text }: { el: TextElement; text: string }) {
  const ref = useRef<HTMLDivElement>(null);

  // اندازه‌ی قلم مستقیم روی DOM تنظیم می‌شود (نه state) تا در یک گذر اندازه‌گیری شود
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    let size = el.fontSize;
    node.style.fontSize = `${size}pt`;
    while ((node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1) && size > MIN_FONT_PT) {
      size = Math.max(MIN_FONT_PT, size - 0.5);
      node.style.fontSize = `${size}pt`;
    }
  }, [el.fontSize, el.bold, el.w, el.h, text]);

  return (
    <div
      ref={ref}
      dir={el.dir}
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: el.valign === "middle" ? "center" : el.valign === "bottom" ? "flex-end" : "flex-start",
        textAlign: el.align,
        lineHeight: 1.3,
        fontWeight: el.bold ? 800 : 400,
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
        background: el.invert ? "#000" : "transparent",
        color: el.invert ? "#fff" : "#000",
        border: el.border ? "0.3mm solid #000" : undefined,
        padding: el.invert || el.border ? "0 1mm" : undefined,
      }}
    >
      <span>{text}</span>
    </div>
  );
}

function ItemsView({ el, items }: { el: ItemsElement; items: PrintItem[] }) {
  return (
    <div dir="rtl" style={{ width: "100%", height: "100%", overflow: "hidden", fontSize: `${el.fontSize}pt`, lineHeight: 1.35 }}>
      {items.map((it, i) => (
        <div key={it.id} style={{ display: "flex", justifyContent: "space-between", gap: "1.5mm", borderBottom: "0.15mm solid #000" }}>
          <span style={{ fontWeight: 700 }}>
            {(i + 1).toLocaleString("fa-IR")}. {it.name}
            {el.showWeight && ` — ${Number(it.weightGrams).toLocaleString("fa-IR", { maximumFractionDigits: 3 })} گرم`}
          </span>
          <span style={{ whiteSpace: "nowrap" }}>
            {el.showBarcode && it.barcode && <span style={{ fontFamily: "monospace", marginLeft: "1.5mm" }}>{it.barcode}</span>}× {it.quantity.toLocaleString("fa-IR")}
          </span>
        </div>
      ))}
    </div>
  );
}

function BarcodeView({ el, value, dpi, raw }: { el: BarcodeElement; value: string; dpi: number; raw: boolean }) {
  if (raw) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          border: "0.3mm dashed #555",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "7pt",
          fontFamily: "monospace",
        }}
      >
        {el.format === "EAN13" ? "EAN-13" : "Code128"} {value}
      </div>
    );
  }
  return <BarcodeSvg format={el.format} value={value} widthMm={el.w} heightMm={el.h} dpi={dpi} showText={el.showText} fontSizePt={el.fontSize} />;
}

export function BarcodeSvg({
  format,
  value,
  widthMm,
  heightMm,
  dpi,
  showText,
  fontSizePt,
}: {
  format: BarcodeFormat;
  value: string;
  widthMm: number;
  heightMm: number;
  dpi: number;
  showText: boolean;
  fontSizePt: number;
}) {
  const enc = value ? encodeBarcode(format, value) : "بارکد ثبت نشده است";
  if (typeof enc === "string") {
    return (
      <div
        dir="rtl"
        style={{
          width: "100%",
          height: "100%",
          border: "0.3mm dashed #000",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          fontSize: "6pt",
          padding: "0.5mm",
          boxSizing: "border-box",
        }}
      >
        {enc}
      </div>
    );
  }

  const total = enc.quietLeft + enc.modules.length + enc.quietRight;
  const dotMm = 25.4 / (dpi || 203);
  // پهنای هر ماژول = مضرب صحیح نقطه‌ی هد چاپ (حداقل یک نقطه)
  const dots = Math.max(1, Math.floor(widthMm / total / dotMm));
  const moduleMm = dots * dotMm;
  const drawnWidth = total * moduleMm;
  const offset = Math.max(0, (widthMm - drawnWidth) / 2);
  const x0 = offset + enc.quietLeft * moduleMm;

  const fontMm = fontSizePt * PT_TO_MM;
  const textH = showText ? fontMm * 1.05 : 0;
  const barH = Math.max(1, heightMm - textH);
  const isEan = format === "EAN13";
  const guardH = isEan && showText ? barH + textH * 0.55 : barH;

  // میله‌های پیوسته را یکجا رسم می‌کنیم
  const rects: { x: number; w: number; guard: boolean }[] = [];
  enc.modules.forEach((on, i) => {
    if (!on) return;
    const last = rects[rects.length - 1];
    const x = x0 + i * moduleMm;
    if (last && Math.abs(last.x + last.w - x) < 1e-6 && last.guard === enc.guards[i]) last.w += moduleMm;
    else rects.push({ x, w: moduleMm, guard: enc.guards[i] });
  });

  const textY = heightMm - fontMm * 0.12;
  const digitsStyle = { fontFamily: "'OCR-B', 'Courier New', monospace", fontSize: fontMm, fill: "#000" } as const;

  return (
    <svg
      width={`${widthMm}mm`}
      height={`${heightMm}mm`}
      viewBox={`0 0 ${widthMm} ${heightMm}`}
      shapeRendering="crispEdges"
      style={{ display: "block" }}
    >
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={0} width={r.w} height={r.guard ? guardH : barH} fill="#000" />
      ))}
      {showText &&
        (isEan ? (
          <>
            <text x={x0 - moduleMm * 4} y={textY} textAnchor="middle" style={digitsStyle}>
              {enc.text[0]}
            </text>
            {[1, 2, 3, 4, 5, 6].map((d, i) => (
              <text key={`l${d}`} x={x0 + (3 + 7 * i + 3.5) * moduleMm} y={textY} textAnchor="middle" style={digitsStyle}>
                {enc.text[d]}
              </text>
            ))}
            {[7, 8, 9, 10, 11, 12].map((d, i) => (
              <text key={`r${d}`} x={x0 + (50 + 7 * i + 3.5) * moduleMm} y={textY} textAnchor="middle" style={digitsStyle}>
                {enc.text[d]}
              </text>
            ))}
          </>
        ) : (
          <text x={widthMm / 2} y={textY} textAnchor="middle" style={digitsStyle}>
            {enc.text}
          </text>
        ))}
    </svg>
  );
}

/** هشدار طراحی: بارکد در این پهنا با این DPI جا نمی‌شود یا میله‌ها بسیار باریک‌اند */
export function barcodeFitWarning(format: BarcodeFormat, sample: string, widthMm: number, dpi: number): string | null {
  const enc = encodeBarcode(format, sample);
  if (typeof enc === "string") return null;
  const total = enc.quietLeft + enc.modules.length + enc.quietRight;
  const dotMm = 25.4 / (dpi || 203);
  const dots = Math.floor(widthMm / total / dotMm);
  if (dots < 1) {
    return `پهنای بارکد کم است: برای این مقدار حداقل ${Math.ceil(total * dotMm)} میلی‌متر لازم است`;
  }
  if (format === "EAN13" && dots * dotMm < 0.25) {
    return "میله‌های بارکد باریک‌اند و ممکن است برخی بارکدخوان‌ها نخوانند؛ پهنای بارکد را بیشتر کنید";
  }
  return null;
}
