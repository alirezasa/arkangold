import { parseProductText, type ProductSpecRow } from "@/app/utils/product-text";

// جدول مشخصات «عنوان | مقدار»
export function ProductSpecTable({ rows }: { rows: ProductSpecRow[] }) {
  if (!rows.length) return null;
  return (
    <dl className="rounded-2xl border border-gray-100 overflow-hidden text-[12px]">
      {rows.map((row, i) => (
        <div
          key={`${row.label}-${i}`}
          className={`flex gap-3 px-4 py-2.5 ${i % 2 ? "bg-white" : "bg-gray-50"}`}
        >
          <dt className="w-2/5 shrink-0 font-bold text-gray-500">{row.label}</dt>
          <dd className="flex-1 text-gray-800 break-words">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// نمایش متن توضیحات با حفظ خطوط؛ خطوط «عنوان: مقدار» به‌صورت جدول
export function ProductText({
  text,
  className = "text-[13px] text-gray-600 leading-relaxed",
}: {
  text: string | null | undefined;
  className?: string;
}) {
  const blocks = parseProductText(text);
  if (!blocks.length) return null;
  return (
    <div className="space-y-3">
      {blocks.map((block, i) =>
        block.kind === "specs" ? (
          <ProductSpecTable key={i} rows={block.rows} />
        ) : (
          <p key={i} className={className}>
            {block.lines.map((line, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {line}
              </span>
            ))}
          </p>
        ),
      )}
    </div>
  );
}
