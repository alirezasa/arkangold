// admin/app/components/JalaliDateInput.tsx
//
// انتخابگر تاریخ شمسی — جایگزین input نوع date / datetime-local در کل پنل.
// مقدار ورودی و خروجی همان قالب input بومی است (ISO میلادی «yyyy-mm-dd» یا با
// withTime «yyyy-mm-ddTHH:mm»)، پس APIها و منطق صفحات بدون تغییر می‌مانند.
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  JALALI_MONTHS,
  JALALI_WEEKDAYS,
  formatJalali,
  isoToJalali,
  jalaliMonthLength,
  jalaliToIso,
  jalaliWeekday,
  parseJalaliInput,
  toEnDigits,
  toFaDigits,
  todayIsoLocal,
} from "@/app/utils/jalali";

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** همراه با ساعت (معادل datetime-local) */
  withTime?: boolean;
  className?: string;
  placeholder?: string;
  /** حداقل/حداکثر تاریخ مجاز (ISO میلادی) */
  min?: string;
  max?: string;
  disabled?: boolean;
  /** امکان پاک کردن مقدار (پیش‌فرض: بله) */
  clearable?: boolean;
  id?: string;
}

const defaultCls =
  "w-full mt-1 px-3 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-gold-500 text-sm bg-white";

export default function JalaliDateInput({
  value,
  onChange,
  withTime = false,
  className,
  placeholder = "انتخاب تاریخ",
  min,
  max,
  disabled,
  clearable = true,
  id,
}: Props) {
  const datePart = value ? value.slice(0, 10) : "";
  const timePart = withTime && value.length >= 16 ? value.slice(11, 16) : "";
  const selected = isoToJalali(datePart);
  const today = isoToJalali(todayIsoLocal())!;

  const [open, setOpen] = useState(false);
  const [view, setView] = useState({ jy: (selected ?? today).jy, jm: (selected ?? today).jm });
  const [text, setText] = useState(formatJalali(datePart));
  const wrapRef = useRef<HTMLDivElement>(null);

  // همگام‌سازی متن نمایشی با مقدار بیرونی (الگوی derived state، بدون effect)
  const [syncedFor, setSyncedFor] = useState(datePart);
  if (syncedFor !== datePart) {
    setSyncedFor(datePart);
    setText(formatJalali(datePart));
  }

  const openPicker = () => {
    if (open) return;
    const s = isoToJalali(datePart) ?? today;
    setView({ jy: s.jy, jm: s.jm });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const emit = (iso: string, time = timePart) => {
    if (!iso) return onChange("");
    onChange(withTime ? `${iso}T${time || "00:00"}` : iso);
  };

  const outOfRange = (iso: string) => (min && iso < min.slice(0, 10)) || (max && iso > max.slice(0, 10));

  const cells = useMemo(() => {
    const first = jalaliWeekday(view.jy, view.jm, 1);
    const len = jalaliMonthLength(view.jy, view.jm);
    const arr: (number | null)[] = Array.from({ length: first }, () => null);
    for (let d = 1; d <= len; d += 1) arr.push(d);
    return arr;
  }, [view]);

  const shiftMonth = (delta: number) =>
    setView((v) => {
      let jm = v.jm + delta;
      let jy = v.jy;
      while (jm > 12) {
        jm -= 12;
        jy += 1;
      }
      while (jm < 1) {
        jm += 12;
        jy -= 1;
      }
      return { jy, jm };
    });

  const commitText = () => {
    if (!text.trim()) {
      if (clearable) emit("");
      return;
    }
    const j = parseJalaliInput(text);
    if (!j) {
      setText(formatJalali(datePart));
      return;
    }
    const iso = jalaliToIso(j.jy, j.jm, j.jd);
    if (outOfRange(iso)) {
      setText(formatJalali(datePart));
      return;
    }
    emit(iso);
  };

  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = today.jy + 10; y >= 1300; y -= 1) list.push(y);
    return list;
  }, [today.jy]);

  return (
    <div ref={wrapRef} className="relative" dir="rtl">
      <div className={`${className ?? defaultCls} flex items-center gap-2 ${disabled ? "opacity-60" : ""}`}>
        <CalendarDays className="w-4 h-4 text-gray-400 shrink-0" />
        <input
          id={id}
          type="text"
          inputMode="numeric"
          value={text}
          disabled={disabled}
          placeholder={placeholder}
          onFocus={openPicker}
          onClick={openPicker}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitText();
              setOpen(false);
            }
            if (e.key === "Escape") setOpen(false);
          }}
          className="flex-1 min-w-0 bg-transparent outline-none text-sm"
          dir="ltr"
          style={{ textAlign: "right" }}
        />
        {withTime && (
          <input
            type="time"
            value={timePart}
            disabled={disabled || !datePart}
            onChange={(e) => emit(datePart, toEnDigits(e.target.value))}
            className="bg-transparent outline-none text-sm w-[5.5rem]"
            dir="ltr"
          />
        )}
        {clearable && value && !disabled && (
          <button type="button" onClick={() => emit("")} className="text-gray-300 hover:text-gray-500" aria-label="پاک کردن تاریخ">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {open && !disabled && (
        <div
          className="absolute z-50 mt-1 w-72 rounded-2xl border border-gray-200 bg-white shadow-xl p-3 select-none"
          style={{ right: 0 }}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <button type="button" onClick={() => shiftMonth(-1)} className="p-1.5 rounded-lg hover:bg-gray-100" aria-label="ماه قبل">
              <ChevronRight className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1">
              <select
                value={view.jm}
                onChange={(e) => setView((v) => ({ ...v, jm: Number(e.target.value) }))}
                className="text-[13px] font-bold bg-transparent outline-none"
              >
                {JALALI_MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                value={view.jy}
                onChange={(e) => setView((v) => ({ ...v, jy: Number(e.target.value) }))}
                className="text-[13px] font-bold bg-transparent outline-none"
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {toFaDigits(String(y))}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" onClick={() => shiftMonth(1)} className="p-1.5 rounded-lg hover:bg-gray-100" aria-label="ماه بعد">
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-gray-400 font-bold mb-1">
            {JALALI_WEEKDAYS.map((w) => (
              <div key={w}>{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {cells.map((d, i) => {
              if (d == null) return <div key={`e${i}`} />;
              const iso = jalaliToIso(view.jy, view.jm, d);
              const isSel = selected && selected.jy === view.jy && selected.jm === view.jm && selected.jd === d;
              const isToday = today.jy === view.jy && today.jm === view.jm && today.jd === d;
              const blocked = !!outOfRange(iso);
              return (
                <button
                  key={d}
                  type="button"
                  disabled={blocked}
                  onClick={() => {
                    emit(iso);
                    if (!withTime) setOpen(false);
                  }}
                  className={`h-8 rounded-lg text-[12px] font-bold transition-colors disabled:opacity-25 ${
                    isSel ? "text-white" : isToday ? "border border-amber-400 text-gray-800" : "text-gray-700 hover:bg-gray-100"
                  } ${i % 7 === 6 && !isSel ? "text-red-500" : ""}`}
                  style={isSel ? { backgroundColor: "var(--color-emerald)" } : undefined}
                >
                  {toFaDigits(String(d))}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => {
                emit(todayIsoLocal());
                if (!withTime) setOpen(false);
              }}
              className="text-[12px] font-bold text-emerald-700"
            >
              امروز
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-[12px] font-bold text-gray-500">
              بستن
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
