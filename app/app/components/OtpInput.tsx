"use client";

import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { digitsOnly } from "@/app/utils/digits";

interface OtpInputProps {
  /** آرایه‌ی ارقام (طول آن تعداد خانه‌ها را مشخص می‌کند) */
  value: string[];
  onChange: (value: string[]) => void;
  /** با پر شدن همه‌ی خانه‌ها صدا زده می‌شود */
  onComplete?: (code: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
}

/**
 * ورودی کد تایید پیامکی:
 * - روی گوشی فقط کیبورد عددی باز می‌شود (inputMode=numeric و pattern)
 * - ارقام فارسی/عربی کیبورد گوشی پذیرفته و به انگلیسی تبدیل می‌شوند
 * - با تایپ هر رقم، فوکوس خودکار به خانه‌ی بعد می‌رود و Backspace به خانه‌ی قبل برمی‌گردد
 * - چسباندن کل کد یا پر شدن خودکار از پیامک (one-time-code) همه‌ی خانه‌ها را پر می‌کند
 */
export default function OtpInput({
  value,
  onChange,
  onComplete,
  disabled = false,
  autoFocus = true,
  className = "",
}: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const length = value.length;

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const focusAt = (index: number) => {
    const el = refs.current[Math.max(0, Math.min(length - 1, index))];
    el?.focus();
    el?.select();
  };

  const commit = (next: string[]) => {
    onChange(next);
    if (next.every((d) => d !== "")) onComplete?.(next.join(""));
  };

  // چند رقم را از خانه‌ی index به بعد پخش می‌کند (چسباندن یا پر شدن خودکار)
  const fillFrom = (index: number, digits: string) => {
    const next = [...value];
    let last = index;
    for (let i = 0; i < digits.length && index + i < length; i++) {
      next[index + i] = digits[i];
      last = index + i;
    }
    commit(next);
    focusAt(last + 1 < length ? last + 1 : last);
  };

  const handleChange = (index: number, raw: string) => {
    const digits = digitsOnly(raw);

    if (!digits) {
      const next = [...value];
      next[index] = "";
      onChange(next);
      return;
    }

    if (digits.length === 1) {
      const next = [...value];
      next[index] = digits;
      commit(next);
      if (index < length - 1) focusAt(index + 1);
      return;
    }

    // خانه از قبل رقم داشت و کاربر رقم جدیدی تایپ کرد → رقم جدید جایگزین می‌شود
    const prev = value[index];
    if (digits.length === 2 && prev) {
      const typed = digits[0] === prev ? digits[1] : digits[0];
      const next = [...value];
      next[index] = typed;
      commit(next);
      if (index < length - 1) focusAt(index + 1);
      return;
    }

    fillFrom(index, digits);
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (value[index] === "" && index > 0) {
        e.preventDefault();
        const next = [...value];
        next[index - 1] = "";
        onChange(next);
        focusAt(index - 1);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusAt(index - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusAt(index + 1);
    }
  };

  const handlePaste = (index: number, e: ClipboardEvent<HTMLInputElement>) => {
    const digits = digitsOnly(e.clipboardData.getData("text"));
    if (!digits) return;
    e.preventDefault();
    fillFrom(digits.length >= length ? 0 : index, digits);
  };

  return (
    <div className={`flex justify-center gap-2 ${className}`} dir="ltr">
      {value.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          enterKeyHint={i === length - 1 ? "done" : "next"}
          aria-label={`رقم ${i + 1} کد تایید`}
          disabled={disabled}
          value={digit}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={(e) => handlePaste(i, e)}
          onFocus={(e) => e.target.select()}
          className="h-14 w-11 min-w-0 rounded-xl border-2 border-gray-200 bg-white text-center text-xl font-black outline-none transition-all focus:scale-105 focus:border-emerald disabled:opacity-60 sm:w-12"
        />
      ))}
    </div>
  );
}
