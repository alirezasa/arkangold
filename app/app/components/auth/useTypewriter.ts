"use client";

import { useEffect, useState } from "react";

/** افکت تایپی: متن‌ها یکی‌یکی تایپ، مکث و پاک می‌شوند */
export function useTypewriter(slides: readonly string[]): string {
  const [index, setIndex] = useState(0);
  const [text, setText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const full = slides[index] ?? "";
    let timeout: ReturnType<typeof setTimeout>;

    if (!deleting && text.length < full.length) {
      timeout = setTimeout(() => setText(full.substring(0, text.length + 1)), 100);
    } else if (!deleting && text.length === full.length) {
      timeout = setTimeout(() => setDeleting(true), 2000);
    } else if (deleting && text.length > 0) {
      timeout = setTimeout(() => setText(full.substring(0, text.length - 1)), 50);
    } else {
      timeout = setTimeout(() => {
        setDeleting(false);
        setIndex((prev) => (prev + 1) % slides.length);
      }, 50);
    }

    return () => clearTimeout(timeout);
  }, [text, deleting, index, slides]);

  return text;
}
