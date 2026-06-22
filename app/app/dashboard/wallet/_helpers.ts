export function rialToToman(rial: number): string {
  const toman = rial / 10;
  if (toman >= 1_000_000_000) return `${(toman / 1_000_000_000).toLocaleString("fa-IR")} میلیارد تومان`;
  if (toman >= 1_000_000)     return `${(toman / 1_000_000).toLocaleString("fa-IR")} میلیون تومان`;
  if (toman >= 1_000)         return `${(toman / 1_000).toLocaleString("fa-IR")} هزار تومان`;
  return `${toman.toLocaleString("fa-IR")} تومان`;
}

/** نمایش ساده بدون واحد */
export function rialToTomanNum(rial: number): string {
  return (rial / 10).toLocaleString("fa-IR");
}

/** تومان ورودی کاربر → ریال برای API */
export function tomanInputToRial(tomanStr: string): number {
  return Number(tomanStr.replace(/,/g, "").replace(/،/g, "")) * 10;
}
