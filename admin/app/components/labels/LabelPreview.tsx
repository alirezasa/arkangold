// admin/app/components/labels/LabelPreview.tsx
// پیش‌نمایش کوچک‌شده‌ی یک طرح با داده‌ی نمونه (کارت طرح‌ها)
"use client";
import { LabelView } from "./LabelView";
import { buildLabels, SAMPLE_DATA } from "./fields";
import type { LabelTemplate } from "./types";

export const PX_PER_MM = 96 / 25.4;

export function LabelPreview({ template, maxWidthPx, maxHeightPx }: { template: LabelTemplate; maxWidthPx: number; maxHeightPx: number }) {
  const { widthMm, heightMm, dpi } = template.size;
  const scale = Math.min(maxWidthPx / (widthMm * PX_PER_MM), maxHeightPx / (heightMm * PX_PER_MM));
  const label = buildLabels(SAMPLE_DATA, template.repeat)[0];
  return (
    <div
      dir="ltr"
      style={{ width: widthMm * PX_PER_MM * scale, height: heightMm * PX_PER_MM * scale, position: "relative" }}
      className="shadow-sm ring-1 ring-gray-200 bg-white"
    >
      <div style={{ position: "absolute", top: 0, left: 0, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        <LabelView widthMm={widthMm} heightMm={heightMm} dpi={dpi} elements={template.elements} ctx={label?.ctx ?? null} items={label?.order.items ?? []} />
      </div>
    </div>
  );
}
