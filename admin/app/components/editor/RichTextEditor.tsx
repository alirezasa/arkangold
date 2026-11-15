"use client";

// ویرایشگر متن توضیحات (بدون وابستگی خارجی): تیتر، پررنگ/کج، لیست، نقل‌قول،
// چینش، لینک، جدول، خط جداکننده و پیش‌نمایش عرض موبایل.
// خروجی همیشه HTML پاک‌سازی‌شده با لیست سفید است (rich-text.ts).

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  Columns3,
  Eraser,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Maximize2,
  Minimize2,
  Minus,
  Monitor,
  Quote,
  Redo2,
  Rows3,
  Smartphone,
  Strikethrough,
  Table,
  Trash2,
  Underline,
  Undo2,
  X,
} from "lucide-react";
import {
  isEmptyHtml,
  normalizeHref,
  sanitizeHtml,
  toEditorHtml,
} from "./rich-text";

type BlockType = "p" | "h2" | "h3" | "h4";

const BLOCK_OPTIONS: { value: BlockType; label: string }[] = [
  { value: "p", label: "متن عادی" },
  { value: "h2", label: "تیتر بزرگ" },
  { value: "h3", label: "تیتر متوسط" },
  { value: "h4", label: "تیتر کوچک" },
];

interface ActiveState {
  block: BlockType;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  ul: boolean;
  ol: boolean;
  quote: boolean;
  link: boolean;
  table: boolean;
  align: "right" | "center" | "left" | "justify" | null;
}

const INITIAL_STATE: ActiveState = {
  block: "p",
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  ul: false,
  ol: false,
  quote: false,
  link: false,
  table: false,
  align: null,
};

// جای مکان‌نما بر حسب شماره‌ی نویسه در کل متن ویرایشگر؛ با تغییر ساختار
// بلوک‌ها (مثلاً تبدیل پاراگراف به لیست) معتبر می‌ماند چون متن عوض نمی‌شود.
interface TextPosition {
  index: number;
  /** مکان‌نما در ابتدای گره‌ی متنی بوده (نه انتهای گره‌ی قبلی) */
  atStart: boolean;
}

function textPosition(
  root: HTMLElement,
  node: Node | null,
  offset: number,
): TextPosition | null {
  if (!node || node.nodeType !== Node.TEXT_NODE || !root.contains(node)) {
    return null;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let index = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n === node) return { index: index + offset, atStart: offset === 0 };
    index += n.textContent?.length ?? 0;
  }
  return null;
}

function resolveTextPosition(
  root: HTMLElement,
  pos: TextPosition,
): [Node, number] | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let start = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const len = n.textContent?.length ?? 0;
    const end = start + len;
    if (pos.index < end || (pos.index === end && !pos.atStart)) {
      return [n, pos.index - start];
    }
    start = end;
  }
  return null;
}

function ToolButton({
  title,
  active = false,
  disabled = false,
  danger = false,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      // mousedown را می‌گیریم تا انتخاب متن داخل ویرایشگر از بین نرود
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`h-8 w-8 shrink-0 rounded-lg flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        active
          ? "bg-gold-100 text-gold-900"
          : danger
            ? "text-red-500 hover:bg-red-50"
            : "text-gray-600 hover:bg-gray-100"
      }`}
    >
      {children}
    </button>
  );
}

const Divider = () => (
  <span className="mx-0.5 h-5 w-px shrink-0 bg-gray-200" aria-hidden="true" />
);

export default function RichTextEditor({
  value,
  onChange,
  placeholder = "توضیحات را اینجا بنویسید...",
  minHeight = 260,
}: {
  /** مقدار اولیه (HTML یا متن ساده‌ی قدیمی)؛ فقط هنگام mount خوانده می‌شود */
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const initialValue = useRef(value);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const [active, setActive] = useState<ActiveState>(INITIAL_STATE);
  const [empty, setEmpty] = useState(!value?.trim());
  const [counts, setCounts] = useState({ words: 0, chars: 0 });
  const [fullscreen, setFullscreen] = useState(false);
  const [mobilePreview, setMobilePreview] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState(false);

  // ── خروجی ──
  const emit = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const html = sanitizeHtml(el.innerHTML);
    const isEmpty = isEmptyHtml(html);
    const text = (el.innerText ?? "").replace(/​/g, "").trim();
    setEmpty(isEmpty);
    setCounts({
      words: text ? text.split(/\s+/).length : 0,
      chars: text.length,
    });
    onChangeRef.current(isEmpty ? "" : html);
  }, []);

  // ── مقداردهی اولیه (یک بار) ──
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.innerHTML = toEditorHtml(initialValue.current);
    // بعد از جدول/خط جداکننده‌ی انتهایی باید جایی برای ادامه‌ی نوشتن باشد
    if (el.lastElementChild && /^(TABLE|HR)$/.test(el.lastElementChild.tagName)) {
      el.insertAdjacentHTML("beforeend", "<p><br></p>");
    }
    try {
      document.execCommand("defaultParagraphSeparator", false, "p");
    } catch {
      /* مرورگر پشتیبانی نمی‌کند */
    }
    const text = (el.innerText ?? "").trim();
    setCounts({ words: text ? text.split(/\s+/).length : 0, chars: text.length });
    setEmpty(isEmptyHtml(sanitizeHtml(el.innerHTML)));
  }, []);

  // ── وضعیت دکمه‌ها بر اساس محل مکان‌نما ──
  const closest = useCallback((selector: string): HTMLElement | null => {
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel || !sel.rangeCount) return null;
    let node: Node | null = sel.anchorNode;
    if (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    if (!(node instanceof HTMLElement) || !el.contains(node)) return null;
    const hit = node.closest(selector);
    return hit instanceof HTMLElement && el.contains(hit) && hit !== el
      ? hit
      : null;
  }, []);

  const refreshState = useCallback(() => {
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel || !sel.rangeCount || !el.contains(sel.anchorNode)) return;
    const q = (cmd: string) => {
      try {
        return document.queryCommandState(cmd);
      } catch {
        return false;
      }
    };
    const heading = closest("h2,h3,h4");
    const blockEl = closest("p,h2,h3,h4,li,td,th");
    const align = blockEl?.style.textAlign || null;
    setActive({
      block: (heading?.tagName.toLowerCase() as BlockType) ?? "p",
      bold: q("bold"),
      italic: q("italic"),
      underline: q("underline"),
      strike: q("strikeThrough"),
      ul: q("insertUnorderedList"),
      ol: q("insertOrderedList"),
      quote: !!closest("blockquote"),
      link: !!closest("a"),
      table: !!closest("table"),
      align:
        align === "right" || align === "center" || align === "left" || align === "justify"
          ? align
          : null,
    });
  }, [closest]);

  useEffect(() => {
    document.addEventListener("selectionchange", refreshState);
    return () => document.removeEventListener("selectionchange", refreshState);
  }, [refreshState]);

  // ── تمام‌صفحه: قفل اسکرول و خروج با Escape ──
  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [fullscreen]);

  // ── اجرای فرمان‌ها ──
  const focusEditor = () => {
    const el = editorRef.current;
    if (!el) return;
    const sel = window.getSelection();
    const inside = !!sel && sel.rangeCount > 0 && el.contains(sel.anchorNode);
    // انتخاب فعلی را نگه می‌داریم؛ فوکوس ممکن است روی نوار ابزار (مثلاً منوی نوع متن) باشد
    const range = inside ? sel.getRangeAt(0).cloneRange() : null;
    if (document.activeElement !== el) el.focus();
    const next = window.getSelection();
    if (!next) return;
    if (range) {
      next.removeAllRanges();
      next.addRange(range);
    } else if (!el.contains(next.anchorNode)) {
      // مکان‌نما به انتهای متن
      const end = document.createRange();
      end.selectNodeContents(el);
      end.collapse(false);
      next.removeAllRanges();
      next.addRange(end);
    }
  };

  const exec = (cmd: string, arg?: string) => {
    focusEditor();
    document.execCommand(cmd, false, arg);
    emit();
    refreshState();
  };

  const setBlock = (block: BlockType) => exec("formatBlock", `<${block}>`);

  // لیست داخل تیتر HTML نامعتبر می‌سازد؛ اول تیتر به متن عادی برمی‌گردد
  const toggleList = (cmd: "insertUnorderedList" | "insertOrderedList") => {
    focusEditor();
    if (closest("h2,h3,h4")) document.execCommand("formatBlock", false, "<p>");

    // کروم لیست را داخل <p> می‌سازد و مکان‌نما را به ابتدای خط می‌برد؛
    // جای مکان‌نما (بر حسب نویسه در کل متن) را نگه می‌داریم و <p> اضافه را برمی‌داریم
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel || !sel.rangeCount) return;
    const anchor = textPosition(el, sel.anchorNode, sel.anchorOffset);
    const focus = textPosition(el, sel.focusNode, sel.focusOffset);

    document.execCommand(cmd);

    const item = closest("li");
    el.querySelectorAll("p > ul, p > ol").forEach((list) => {
      const wrapper = list.parentElement;
      if (!wrapper) return;
      const frag = document.createDocumentFragment();
      while (wrapper.firstChild) frag.appendChild(wrapper.firstChild);
      wrapper.replaceWith(frag);
    });

    const a = anchor && resolveTextPosition(el, anchor);
    const f = focus && resolveTextPosition(el, focus);
    const after = window.getSelection();
    if (a && f) {
      after?.setBaseAndExtent(a[0], a[1], f[0], f[1]);
    } else if (item && el.contains(item)) {
      // خط خالی: مکان‌نما در ابتدای همان مورد لیست
      const range = document.createRange();
      range.setStart(item, 0);
      range.collapse(true);
      after?.removeAllRanges();
      after?.addRange(range);
    }
    emit();
    refreshState();
  };

  const toggleQuote = () => {
    const quote = closest("blockquote");
    if (!quote) return exec("formatBlock", "<blockquote>");
    // برداشتن نقل‌قول: محتوای آن جایگزین خودش می‌شود
    const frag = document.createDocumentFragment();
    while (quote.firstChild) frag.appendChild(quote.firstChild);
    quote.replaceWith(frag);
    emit();
    refreshState();
  };

  const clearFormatting = () => {
    focusEditor();
    document.execCommand("removeFormat");
    document.execCommand("unlink");
    document.execCommand("formatBlock", false, "<p>");
    emit();
    refreshState();
  };

  // ── لینک ──
  const openLink = () => {
    const sel = window.getSelection();
    const el = editorRef.current;
    savedRange.current =
      sel && sel.rangeCount && el?.contains(sel.anchorNode)
        ? sel.getRangeAt(0).cloneRange()
        : null;
    setLinkUrl(closest("a")?.getAttribute("href") ?? "");
    setLinkError(false);
    setLinkOpen(true);
  };

  const restoreRange = () => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    if (savedRange.current) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(savedRange.current);
    }
  };

  const applyLink = () => {
    const href = normalizeHref(linkUrl, true);
    if (!href) return setLinkError(true);
    restoreRange();
    const existing = closest("a");
    if (existing) {
      existing.setAttribute("href", href);
    } else if (window.getSelection()?.isCollapsed) {
      const a = document.createElement("a");
      a.href = href;
      a.textContent = href;
      document.execCommand("insertHTML", false, a.outerHTML);
    } else {
      document.execCommand("createLink", false, href);
    }
    setLinkOpen(false);
    emit();
    refreshState();
  };

  const removeLink = () => {
    restoreRange();
    const a = closest("a");
    if (a) {
      // کل لینک، نه فقط بخش انتخاب‌شده
      const range = document.createRange();
      range.selectNodeContents(a);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    document.execCommand("unlink");
    setLinkOpen(false);
    emit();
    refreshState();
  };

  // ── جدول ──
  const insertTable = () =>
    exec(
      "insertHTML",
      "<table><tbody>" +
        "<tr><th>عنوان</th><td>مقدار</td></tr>" +
        "<tr><th>عنوان</th><td>مقدار</td></tr>" +
        "</tbody></table><p><br></p>",
    );

  const tableAction = (action: "row" | "col" | "delRow" | "delTable") => {
    const cell = closest("td,th");
    const row = cell?.closest("tr");
    const table = row?.closest("table");
    if (!cell || !row || !table) return;

    if (action === "row") {
      const next = document.createElement("tr");
      Array.from(row.children).forEach((c) => {
        const n = document.createElement(c.tagName.toLowerCase());
        n.appendChild(document.createElement("br"));
        next.appendChild(n);
      });
      row.after(next);
    } else if (action === "col") {
      table.querySelectorAll("tr").forEach((tr) => {
        const td = document.createElement("td");
        td.appendChild(document.createElement("br"));
        tr.appendChild(td);
      });
    } else if (action === "delRow") {
      if (table.querySelectorAll("tr").length <= 1) table.remove();
      else row.remove();
    } else {
      table.remove();
    }
    emit();
    refreshState();
  };

  // ── رویدادهای ویرایشگر ──
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const html = e.clipboardData.getData("text/html");
    const text = e.clipboardData.getData("text/plain");
    let clean = "";
    if (html) {
      clean = sanitizeHtml(html);
    } else if (text) {
      clean = text
        .replace(/\r\n?/g, "\n")
        .split(/\n{2,}/)
        .map(
          (para) =>
            `<p>${para
              .split("\n")
              .map((l) =>
                l
                  .replace(/&/g, "&amp;")
                  .replace(/</g, "&lt;")
                  .replace(/>/g, "&gt;"),
              )
              .join("<br>")}</p>`,
        )
        .join("");
      // متن تک‌خطی داخل همان پاراگراف فعلی می‌نشیند
      if (!text.includes("\n")) clean = clean.replace(/^<p>|<\/p>$/g, "");
    }
    if (clean) document.execCommand("insertHTML", false, clean);
    emit();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openLink();
    }
  };

  const handleInput = () => {
    // متن بدون بلوک در ریشه (مثلاً نوشتن بعد از جدول) فوراً داخل <p> می‌رود؛
    // وگرنه تیتر/چینش و جای مکان‌نما در مرورگرها درست رفتار نمی‌کند
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    if (
      node &&
      node.nodeType === Node.TEXT_NODE &&
      node.parentNode === editorRef.current
    ) {
      document.execCommand("formatBlock", false, "<p>");
    }
    emit();
  };

  const handleFocus = () => {
    const el = editorRef.current;
    // شروع نوشتن همیشه داخل <p> تا تیتر/چینش درست اعمال شود
    if (el && !el.innerHTML.trim()) {
      el.innerHTML = "<p><br></p>";
      const range = document.createRange();
      range.setStart(el.firstChild as Node, 0);
      range.collapse(true);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  };

  const icon = "w-4 h-4";

  return (
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-[200] flex flex-col bg-white p-3 sm:p-6"
          : "flex flex-col"
      }
      dir="rtl"
    >
      <div
        className={`flex min-h-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white focus-within:border-gold-500 ${
          fullscreen ? "flex-1" : ""
        }`}
      >
        {/* ── نوار ابزار ── */}
        <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 bg-gray-50 px-2 py-1.5">
          <ToolButton title="واگرد (Ctrl+Z)" onClick={() => exec("undo")}>
            <Undo2 className={icon} />
          </ToolButton>
          <ToolButton title="ازنو (Ctrl+Y)" onClick={() => exec("redo")}>
            <Redo2 className={icon} />
          </ToolButton>
          <Divider />

          <select
            value={active.block}
            onChange={(e) => setBlock(e.target.value as BlockType)}
            title="نوع متن"
            aria-label="نوع متن"
            className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-[12px] font-bold text-gray-700 outline-none"
          >
            {BLOCK_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <Divider />

          <ToolButton
            title="پررنگ (Ctrl+B)"
            active={active.bold}
            onClick={() => exec("bold")}
          >
            <Bold className={icon} />
          </ToolButton>
          <ToolButton
            title="کج (Ctrl+I)"
            active={active.italic}
            onClick={() => exec("italic")}
          >
            <Italic className={icon} />
          </ToolButton>
          <ToolButton
            title="زیرخط (Ctrl+U)"
            active={active.underline}
            onClick={() => exec("underline")}
          >
            <Underline className={icon} />
          </ToolButton>
          <ToolButton
            title="خط‌خورده"
            active={active.strike}
            onClick={() => exec("strikeThrough")}
          >
            <Strikethrough className={icon} />
          </ToolButton>
          <Divider />

          <ToolButton
            title="لیست نقطه‌ای"
            active={active.ul}
            onClick={() => toggleList("insertUnorderedList")}
          >
            <List className={icon} />
          </ToolButton>
          <ToolButton
            title="لیست شماره‌دار"
            active={active.ol}
            onClick={() => toggleList("insertOrderedList")}
          >
            <ListOrdered className={icon} />
          </ToolButton>
          <ToolButton title="نقل‌قول / نکته" active={active.quote} onClick={toggleQuote}>
            <Quote className={icon} />
          </ToolButton>
          <Divider />

          <ToolButton
            title="راست‌چین"
            active={active.align === "right"}
            onClick={() => exec("justifyRight")}
          >
            <AlignRight className={icon} />
          </ToolButton>
          <ToolButton
            title="وسط‌چین"
            active={active.align === "center"}
            onClick={() => exec("justifyCenter")}
          >
            <AlignCenter className={icon} />
          </ToolButton>
          <ToolButton
            title="چپ‌چین"
            active={active.align === "left"}
            onClick={() => exec("justifyLeft")}
          >
            <AlignLeft className={icon} />
          </ToolButton>
          <ToolButton
            title="تراز دوطرفه"
            active={active.align === "justify"}
            onClick={() => exec("justifyFull")}
          >
            <AlignJustify className={icon} />
          </ToolButton>
          <Divider />

          <ToolButton title="لینک (Ctrl+K)" active={active.link} onClick={openLink}>
            <Link2 className={icon} />
          </ToolButton>
          <ToolButton title="خط جداکننده" onClick={() => exec("insertHorizontalRule")}>
            <Minus className={icon} />
          </ToolButton>
          <ToolButton title="درج جدول" active={active.table} onClick={insertTable}>
            <Table className={icon} />
          </ToolButton>
          <ToolButton title="پاک کردن قالب‌بندی" onClick={clearFormatting}>
            <Eraser className={icon} />
          </ToolButton>

          <span className="flex-1" />
          <ToolButton
            title={mobilePreview ? "نمای دسکتاپ" : "پیش‌نمایش عرض موبایل"}
            active={mobilePreview}
            onClick={() => setMobilePreview((v) => !v)}
          >
            {mobilePreview ? (
              <Monitor className={icon} />
            ) : (
              <Smartphone className={icon} />
            )}
          </ToolButton>
          <ToolButton
            title={fullscreen ? "خروج از تمام‌صفحه (Esc)" : "تمام‌صفحه"}
            onClick={() => setFullscreen((v) => !v)}
          >
            {fullscreen ? (
              <Minimize2 className={icon} />
            ) : (
              <Maximize2 className={icon} />
            )}
          </ToolButton>
        </div>

        {/* ── ابزار جدول (وقتی مکان‌نما داخل جدول است) ── */}
        {active.table && (
          <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 bg-gold-50 px-2 py-1.5 text-[11px] font-bold text-gray-600">
            <span className="px-1">جدول:</span>
            {(
              [
                ["row", "افزودن ردیف", Rows3],
                ["col", "افزودن ستون", Columns3],
                ["delRow", "حذف ردیف", Minus],
                ["delTable", "حذف جدول", Trash2],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => tableAction(key)}
                className={`flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 hover:bg-gray-50 ${
                  key.startsWith("del") ? "text-red-500" : ""
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        )}

        {/* ── نوار لینک ── */}
        {linkOpen && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-200 bg-gold-50 px-2 py-1.5">
            <input
              autoFocus
              dir="ltr"
              value={linkUrl}
              onChange={(e) => {
                setLinkUrl(e.target.value);
                setLinkError(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyLink();
                } else if (e.key === "Escape") {
                  setLinkOpen(false);
                }
              }}
              placeholder="https://arkan.gold/..."
              className={`h-8 min-w-0 flex-1 rounded-lg border bg-white px-2.5 text-left text-[12px] outline-none ${
                linkError ? "border-red-400" : "border-gray-200 focus:border-gold-500"
              }`}
            />
            <ToolButton title="ثبت لینک" onClick={applyLink}>
              <Check className={icon} />
            </ToolButton>
            {active.link && (
              <ToolButton title="حذف لینک" danger onClick={removeLink}>
                <Link2Off className={icon} />
              </ToolButton>
            )}
            <ToolButton title="بستن" onClick={() => setLinkOpen(false)}>
              <X className={icon} />
            </ToolButton>
            {linkError && (
              <p className="w-full text-[10px] font-bold text-red-500">
                نشانی لینک معتبر نیست
              </p>
            )}
          </div>
        )}

        {/* ── ناحیه‌ی نوشتن (با همان استایل نمایش در اپ کاربر) ── */}
        <div
          className={`relative min-h-0 overflow-y-auto ${
            fullscreen ? "flex-1" : "max-h-[70vh]"
          } ${mobilePreview ? "bg-gray-100 p-3" : ""}`}
        >
          <div
            className={
              mobilePreview
                ? "relative mx-auto w-full max-w-[360px] rounded-2xl border border-gray-200 bg-white shadow-sm"
                : "relative"
            }
          >
            {empty && (
              <p className="pointer-events-none absolute right-4 top-3 text-[13px] text-gray-400">
                {placeholder}
              </p>
            )}
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="true"
              aria-label="توضیحات کامل محصول"
              onInput={handleInput}
              onBlur={emit}
              onFocus={handleFocus}
              onPaste={handlePaste}
              onKeyDown={handleKeyDown}
              className="rich-content rich-editor px-4 py-3 outline-none"
              style={{ minHeight: fullscreen ? "100%" : minHeight }}
            />
          </div>
        </div>

        {/* ── نوار وضعیت ── */}
        <div className="flex items-center justify-between gap-2 border-t border-gray-200 bg-gray-50 px-3 py-1.5 text-[10px] text-gray-400">
          <span>
            {mobilePreview
              ? "پیش‌نمایش عرض موبایل — همین‌جا هم می‌توانید ویرایش کنید"
              : "نمایش در اپ کاربر مطابق همین قالب‌بندی است"}
          </span>
          <span className="shrink-0">
            {counts.words.toLocaleString("fa-IR")} کلمه ·{" "}
            {counts.chars.toLocaleString("fa-IR")} نویسه
          </span>
        </div>
      </div>
    </div>
  );
}
