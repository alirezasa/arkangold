/**
 * TODO: پروژه در حال حاضر قیمت طلا را از Talasea می‌گیرد (api/src/market/price.service.ts)،
 * نه از فینوتک. اگر قرار است فینوتک جایگزین/Fallback آن شود، ابتدا مستندات مربوطه لازم است.
 * این Contract فقط برای هم‌راستایی معماری تعریف شده و فعلاً به PriceService پروژه متصل نیست.
 */
export interface GoldPriceResult {
  pricePerGramRial: string;
  fetchedAt: string;
  providerRequestId?: string;
}

export interface GoldPriceProvider {
  readonly providerCode: string;
  getCurrentPrice(): Promise<GoldPriceResult>;
}
