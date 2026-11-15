"use client";

import { createElement, useMemo, type ReactNode } from "react";
import { isRichText } from "@/app/utils/product-text";
import { ProductText } from "@/app/dashboard/components/shop/ProductText";

// نمایش توضیحات محصول که با ویرایشگر متن پنل ادمین نوشته شده است.
// HTML هرگز مستقیم تزریق نمی‌شود: درخت DOM آن خوانده و فقط تگ‌های مجاز
// (بدون هیچ صفتی جز لینک معتبر و چینش متن) به المان React تبدیل می‌شوند.

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
]);
const STRUCTURAL = new Set(["table", "thead", "tbody", "tr", "ul", "ol"]);
const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/|#)[^\s"'<>\\`]*$/i;
const ALIGNS = ["right", "left", "center", "justify"] as const;

function convert(node: Node, key: number): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const el = node as HTMLElement;
  const raw = el.tagName.toLowerCase();
  if (DROPPED.has(raw)) return null;

  const tag = TAG_ALIASES[raw] ?? raw;
  // فاصله‌های خالی بین تگ‌های ساختاری (جدول/لیست) گره‌ی معتبری نیستند
  const structural = STRUCTURAL.has(raw);
  const children = Array.from(el.childNodes)
    .filter(
      (c) =>
        !structural ||
        c.nodeType !== Node.TEXT_NODE ||
        (c.textContent ?? "").trim() !== "",
    )
    .map(convert);
  if (!ALLOWED.has(tag)) return children;
  if (tag === "br" || tag === "hr") return createElement(tag, { key });

  const props: Record<string, unknown> = { key };

  if (tag === "a") {
    const href = (el.getAttribute("href") ?? "").trim();
    if (!SAFE_HREF.test(href)) return children;
    props.href = href;
    if (/^https?:/i.test(href)) {
      props.target = "_blank";
      props.rel = "noopener noreferrer nofollow";
    }
  } else if (ALIGNABLE.has(tag)) {
    const align = (el.style.textAlign || el.getAttribute("align") || "").toLowerCase();
    if ((ALIGNS as readonly string[]).includes(align)) {
      props.style = { textAlign: align };
    }
  }

  const element = createElement(tag, props, ...children);
  // جدول داخل قاب اسکرول افقی تا در موبایل صفحه را نشکند
  return tag === "table" ? (
    <div key={key} className="rich-table-wrap">
      {element}
    </div>
  ) : (
    element
  );
}

export default function RichContent({
  html,
  className = "",
}: {
  html: string | null | undefined;
  className?: string;
}) {
  const rich = isRichText(html);

  const nodes = useMemo(() => {
    if (!rich || !html || typeof window === "undefined") return null;
    const doc = new DOMParser().parseFromString(html, "text/html");
    return Array.from(doc.body.childNodes).map(convert);
  }, [html, rich]);

  if (!html?.trim()) return null;
  // توضیحات قدیمی (متن ساده) با همان نمایش قبلی
  if (!rich) {
    return (
      <ProductText
        text={html}
        className="text-[14px] text-gray-600 leading-loose"
      />
    );
  }
  return <div className={`rich-content ${className}`}>{nodes}</div>;
}
