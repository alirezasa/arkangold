// ابزارهای ویرایشگر متن توضیحات محصول: پاک‌سازی HTML (لیست سفید) و تبدیل
// متن ساده‌ی قدیمی به HTML. همین قواعد در API (rich-text.util.ts) هم اعمال می‌شود.

const TAG_ALIASES: Record<string, string> = {
  b: "strong",
  i: "em",
  strike: "s",
  del: "s",
  h1: "h2",
  h5: "h4",
  h6: "h4",
  div: "p",
};

const ALLOWED = new Set([
  "p", "br", "h2", "h3", "h4", "strong", "em", "u", "s", "ul", "ol", "li",
  "blockquote", "a", "hr", "table", "thead", "tbody", "tr", "th", "td",
]);
const ALIGNABLE = new Set(["p", "h2", "h3", "h4", "li", "th", "td"]);
const DROPPED = new Set([
  "script", "style", "iframe", "object", "embed", "noscript", "template",
  "svg", "math", "head", "title", "textarea", "select", "button", "form",
  "meta", "link",
]);
// بلوک‌هایی که نباید داخل <p> بنشینند
const BLOCKS = new Set(["p", "h2", "h3", "h4", "ul", "ol", "blockquote", "hr", "table"]);

const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/|#)[^\s"'<>\\`]*$/i;
const RICH_TEXT_HINT =
  /<\/?(p|h[1-6]|ul|ol|li|blockquote|div|table|hr|br|strong|em|b|i|u|a|span)\b/i;

export function isRichText(text: string | null | undefined): boolean {
  return !!text && RICH_TEXT_HINT.test(text);
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * نشانی لینک معتبر یا null. در حالت lenient (ورودی دستی ادمین) نشانی بدون
 * طرح مثل «arkan.gold/x» با https:// کامل می‌شود.
 */
export function normalizeHref(raw: string, lenient = false): string | null {
  let href = raw.trim();
  if (!href) return null;
  if (
    lenient &&
    !/^(https?:\/\/|mailto:|tel:|\/|#)/i.test(href) &&
    // طرح ناشناخته (javascript:، data: و ...) کامل نمی‌شود؛ «host:port» مجاز است
    !/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(href)
  ) {
    href = `https://${href}`;
  }
  return SAFE_HREF.test(href) ? href : null;
}

function serialize(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return esc((node.textContent ?? "").replace(/​/g, ""));
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as HTMLElement;
  const raw = el.tagName.toLowerCase();
  if (DROPPED.has(raw)) return "";

  let tag = TAG_ALIASES[raw] ?? raw;
  // مرورگرها گاهی به‌جای تگ معنایی، span استایل‌دار می‌سازند
  if (raw === "span") {
    const weight = el.style.fontWeight;
    if (weight === "bold" || Number(weight) >= 600) tag = "strong";
    else if (el.style.fontStyle === "italic") tag = "em";
    else if (el.style.textDecoration.includes("underline")) tag = "u";
    else if (el.style.textDecoration.includes("line-through")) tag = "s";
  }

  let inner = Array.from(el.childNodes).map(serialize).join("");
  if (!ALLOWED.has(tag)) return inner;
  if (tag === "br" || tag === "hr") return `<${tag}>`;

  // div که خودش بلوک دارد فقط یک پوشش است
  if (raw === "div" && Array.from(el.children).some((c) => {
    const t = c.tagName.toLowerCase();
    return BLOCKS.has(TAG_ALIASES[t] ?? t);
  })) {
    return inner;
  }

  let attrs = "";
  if (tag === "a") {
    const href = normalizeHref(el.getAttribute("href") ?? "");
    if (!href) return inner;
    attrs = ` href="${href.replace(/&/g, "&amp;")}"`;
  } else if (ALIGNABLE.has(tag)) {
    const align = (el.style.textAlign || el.getAttribute("align") || "").toLowerCase();
    if (["right", "left", "center", "justify"].includes(align)) {
      attrs = ` style="text-align:${align}"`;
    }
  }

  if (tag === "p" || tag === "h2" || tag === "h3" || tag === "h4") {
    // بلوک خالی (فقط <br>) را نگه می‌داریم تا خط خالی عمدی از بین نرود
    if (!inner.replace(/<br>/g, "").trim()) inner = "<br>";
  }
  return `<${tag}${attrs}>${inner}</${tag}>`;
}

/** HTML دلخواه (محتوای ویرایشگر یا متن چسبانده‌شده) → HTML پاک و یکدست */
export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  // متن/اینلاینِ بدون والد بلوکی در ریشه → داخل <p>
  const out: string[] = [];
  let loose = "";
  const flush = () => {
    if (loose.replace(/<br>/g, "").trim()) out.push(`<p>${loose}</p>`);
    loose = "";
  };
  for (const child of Array.from(doc.body.childNodes)) {
    const piece = serialize(child);
    if (!piece) continue;
    if (/^<(p|h[2-4]|ul|ol|blockquote|hr|table)[\s>]/.test(piece)) {
      flush();
      out.push(piece);
    } else {
      loose += piece;
    }
  }
  flush();
  // پاراگراف‌های خالی ابتدا و انتها فاصله‌ی بی‌دلیل در نمایش می‌سازند
  const isBlank = (piece: string) => /^<p[^>]*>(<br>|\s|&nbsp;)*<\/p>$/.test(piece);
  while (out.length && isBlank(out[0])) out.shift();
  while (out.length && isBlank(out[out.length - 1])) out.pop();
  return out.join("");
}

/** آیا محتوا واقعاً خالی است (فقط بلوک‌های خالی)؟ */
export function isEmptyHtml(html: string): boolean {
  return !html.replace(/<(?!hr|table)[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

const SPEC_LINE = /^([^:：\n]{1,40}?)\s*[:：]\s*(\S.*)$/;

/**
 * متن ساده‌ی قدیمی → HTML معادل همان نمایش قبلی:
 * خطوط پشت‌سرهم یک پاراگراف، و خطوط «عنوان: مقدار» یک جدول.
 */
export function plainTextToHtml(text: string): string {
  const out: string[] = [];
  let para: string[] = [];
  let rows: string[] = [];
  const flushPara = () => {
    if (para.length) out.push(`<p>${para.join("<br>")}</p>`);
    para = [];
  };
  const flushRows = () => {
    if (rows.length) out.push(`<table><tbody>${rows.join("")}</tbody></table>`);
    rows = [];
  };

  for (const rawLine of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      flushPara();
      flushRows();
      continue;
    }
    const m = SPEC_LINE.exec(line);
    if (m && !m[2].startsWith("//")) {
      flushPara();
      rows.push(`<tr><th>${esc(m[1].trim())}</th><td>${esc(m[2].trim())}</td></tr>`);
    } else {
      flushRows();
      para.push(esc(line));
    }
  }
  flushPara();
  flushRows();
  return out.join("");
}

/** مقدار ذخیره‌شده (HTML یا متن قدیمی) → HTML اولیه‌ی ویرایشگر */
export function toEditorHtml(value: string | null | undefined): string {
  if (!value?.trim()) return "";
  return isRichText(value) ? sanitizeHtml(value) : plainTextToHtml(value);
}
