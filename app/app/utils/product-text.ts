// تبدیل متن آزاد توضیحات محصول (که ادمین در textarea می‌نویسد) به بلوک‌های
// قابل نمایش: هر خط جداگانه، و خطوط «عنوان: مقدار» به‌صورت ردیف جدول.

export interface ProductSpecRow {
  label: string;
  value: string;
}

export type ProductTextBlock =
  | { kind: "paragraph"; lines: string[] }
  | { kind: "specs"; rows: ProductSpecRow[] };

// عنوان کوتاه (حداکثر ۴۰ کاراکتر، بدون دونقطه) + «:» یا «：» + مقدار
const SPEC_LINE = /^([^:：\n]{1,40}?)\s*[:：]\s*(\S.*)$/;

export function parseSpecLine(line: string): ProductSpecRow | null {
  const match = SPEC_LINE.exec(line.trim());
  if (!match) return null;
  const [, label, value] = match;
  // جلوگیری از تشخیص اشتباه لینک‌ها (https://...)
  if (value.startsWith("//")) return null;
  return { label: label.trim(), value: value.trim() };
}

export function parseProductText(text: string | null | undefined): ProductTextBlock[] {
  if (!text) return [];
  const blocks: ProductTextBlock[] = [];

  for (const rawLine of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    const last = blocks[blocks.length - 1];

    if (!line) {
      // خط خالی = پایان پاراگراف فعلی
      if (last?.kind === "paragraph" && last.lines.length) {
        blocks.push({ kind: "paragraph", lines: [] });
      }
      continue;
    }

    const spec = parseSpecLine(line);
    if (spec) {
      if (last?.kind === "specs") last.rows.push(spec);
      else blocks.push({ kind: "specs", rows: [spec] });
    } else if (last?.kind === "paragraph") {
      last.lines.push(line);
    } else {
      blocks.push({ kind: "paragraph", lines: [line] });
    }
  }

  return blocks.filter((b) => (b.kind === "paragraph" ? b.lines.length > 0 : true));
}

const normalizeLabel = (label: string) =>
  label.replace(/[\s‌]+/g, "").toLowerCase();

// جستجوی یک مشخصه (مثلاً «ابعاد») اول در مشخصات فنی ساختاریافته،
// سپس در خطوط «عنوان: مقدار» توضیحات کوتاه و کامل
export function findProductSpec(
  product: {
    specifications?: ProductSpecRow[] | null;
    shortDescription?: string | null;
    description?: string | null;
  },
  labels: string[],
): string | null {
  const wanted = new Set(labels.map(normalizeLabel));
  const fromText = [product.shortDescription, product.description].flatMap((t) =>
    parseProductText(t).flatMap((b) => (b.kind === "specs" ? b.rows : [])),
  );
  const hit = [...(product.specifications ?? []), ...fromText].find((row) =>
    wanted.has(normalizeLabel(row.label)),
  );
  return hit?.value ?? null;
}
