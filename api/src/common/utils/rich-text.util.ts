// پاک‌سازی HTML توضیحات محصول (خروجی ویرایشگر متن پنل ادمین).
//
// خروجی از صفر ساخته می‌شود: فقط تگ‌های مجاز، بدون هیچ صفتی جز href معتبر
// روی لینک و text-align روی بلوک‌ها. هیچ بخشی از متن خام صفت‌ها به خروجی
// راه پیدا نمی‌کند؛ پس اسکریپت، on*، style دلخواه و ... حذف می‌شوند.
// متن ساده‌ی قدیمی (بدون تگ) دست‌نخورده می‌ماند.

const TAG_ALIASES: Record<string, string> = {
  b: 'strong',
  i: 'em',
  strike: 's',
  del: 's',
  h1: 'h2',
  h5: 'h4',
  h6: 'h4',
  div: 'p',
};

const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'h2',
  'h3',
  'h4',
  'strong',
  'em',
  'u',
  's',
  'ul',
  'ol',
  'li',
  'blockquote',
  'a',
  'hr',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
]);

const VOID_TAGS = new Set(['br', 'hr']);
const ALIGNABLE_TAGS = new Set(['p', 'h2', 'h3', 'h4', 'li', 'th', 'td']);

// محتوای این تگ‌ها کامل دور ریخته می‌شود (نه فقط خود تگ)
const DROP_WITH_CONTENT = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'noscript',
  'template',
  'svg',
  'math',
  'head',
  'title',
  'textarea',
  'select',
  'button',
  'form',
]);

const TOKEN =
  /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b((?:"[^"]*"|'[^']*'|[^'">])*)>|[^<]+|</g;

// فقط نشانی‌هایی که «به‌صورت خام» با طرح مجاز شروع می‌شوند؛ بنابراین طرح‌های
// پنهان‌شده با entity (مثل java&#115;cript:) رد می‌شوند.
const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/|#)[^\s"'<>\\`]*$/i;

const RICH_TEXT_HINT =
  /<\/?(p|h[1-6]|ul|ol|li|blockquote|div|table|hr|br|strong|em|b|i|u|a|span)\b/i;

export function isRichText(text: string | null | undefined): boolean {
  return !!text && RICH_TEXT_HINT.test(text);
}

function readAttr(attrs: string, name: string): string | null {
  const re = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`,
    'i',
  );
  const m = re.exec(attrs);
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null;
}

function readAlign(attrs: string): string | null {
  const style = readAttr(attrs, 'style');
  const fromStyle = style
    ? /(?:^|;)\s*text-align\s*:\s*(right|left|center|justify)\b/i.exec(style)
    : null;
  const value = (fromStyle?.[1] ?? readAttr(attrs, 'align') ?? '').toLowerCase();
  return ['right', 'left', 'center', 'justify'].includes(value) ? value : null;
}

function escapeText(text: string): string {
  return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function sanitizeRichText(input: string): string {
  const out: string[] = [];
  const open: string[] = [];
  let dropUntil: string | null = null;

  TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(input))) {
    const [token, slash, rawName, attrs = ''] = m;

    if (rawName === undefined) {
      // متن ساده، کامنت یا «<» تنها
      if (!dropUntil && !token.startsWith('<!--')) out.push(escapeText(token));
      continue;
    }

    const lower = rawName.toLowerCase();
    const closing = slash === '/';

    if (dropUntil) {
      if (closing && lower === dropUntil) dropUntil = null;
      continue;
    }
    if (DROP_WITH_CONTENT.has(lower)) {
      if (!closing && !/\/\s*$/.test(attrs)) dropUntil = lower;
      continue;
    }

    const tag = TAG_ALIASES[lower] ?? lower;
    if (!ALLOWED_TAGS.has(tag)) continue; // تگ ناشناخته حذف، محتوایش حفظ

    if (closing) {
      if (VOID_TAGS.has(tag)) continue;
      const idx = open.lastIndexOf(tag);
      if (idx === -1) continue;
      while (open.length > idx) out.push(`</${open.pop()}>`);
      continue;
    }

    if (VOID_TAGS.has(tag)) {
      out.push(`<${tag}>`);
      continue;
    }

    let attrOut = '';
    if (tag === 'a') {
      const href = (readAttr(attrs, 'href') ?? '').trim();
      if (SAFE_HREF.test(href)) attrOut = ` href="${href}"`;
    } else if (ALIGNABLE_TAGS.has(tag)) {
      const align = readAlign(attrs);
      if (align) attrOut = ` style="text-align:${align}"`;
    }
    out.push(`<${tag}${attrOut}>`);
    open.push(tag);
  }

  while (open.length) out.push(`</${open.pop()}>`);
  return out.join('').trim();
}

/**
 * توضیحات محصول پیش از ذخیره: متن ساده بدون تغییر، HTML پاک‌سازی‌شده.
 * undefined (فیلد ارسال نشده) همان undefined می‌ماند.
 */
export function cleanProductDescription<T extends string | null | undefined>(
  value: T,
): T {
  if (typeof value !== 'string' || !isRichText(value)) return value;
  return sanitizeRichText(value) as T;
}
