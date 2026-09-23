// کلید idempotency از مولد امن مرورگر (Web Crypto)؛ هرگز Math.random (FCS_RNG_EXT.1.1)
export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // randomUUID فقط در secure context (HTTPS) موجود است؛ getRandomValues همه‌جا هست
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
