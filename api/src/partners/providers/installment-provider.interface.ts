// api/src/partners/providers/installment-provider.interface.ts
//
// قرارداد مشترک آداپتورهای سرویس‌های خرید اقساطی (اسنپ‌پی، دیجی‌پی، ...).
// منطق مالی (سند حسابداری، واریز طلا، دفتر معین شریک) کاملاً در PartnerOrdersService
// است و به آداپتور وابسته نیست؛ آداپتور فقط ارتباط با API شریک را انجام می‌دهد:
//   ۱) ایجاد درخواست پرداخت اقساطی و دریافت لینک هدایت مشتری
//   ۲) تأیید (verify) و قطعی‌سازی (settle) تراکنش پس از بازگشت مشتری
//   ۳) لغو/استرداد
//   ۴) دریافت گزارش تسویه برای مغایرت‌گیری
// پس از دریافت مستندات و قرارداد هر شریک، کافی است متدهای آداپتور همان شریک پیاده شود.

export interface InstallmentCreateInput {
  orderNumber: string;
  amountRial: number;
  customerPhone: string;
  callbackUrl: string;
  description: string;
}

export interface InstallmentCreateResult {
  /** شناسه‌ی تراکنش نزد شریک — در PartnerOrder.externalRef ذخیره می‌شود */
  externalRef: string;
  redirectUrl: string;
}

export interface InstallmentVerifyResult {
  approved: boolean;
  externalRef: string;
  amountRial: number;
  installmentCount?: number;
  downPaymentRial?: number;
  raw?: unknown;
}

export interface InstallmentSettlementRow {
  externalRef: string;
  amountRial: number;
  commissionRial: number;
  settledAt: string;
  bankReference?: string;
}

export interface InstallmentProvider {
  readonly key: string;
  readonly displayName: string;
  /** آیا اطلاعات اتصال (توکن/کلید) تنظیم شده و آداپتور آماده است */
  isConfigured(): boolean;
  create(input: InstallmentCreateInput): Promise<InstallmentCreateResult>;
  verify(externalRef: string): Promise<InstallmentVerifyResult>;
  cancel(externalRef: string, reason: string): Promise<void>;
  settlements(from: Date, to: Date): Promise<InstallmentSettlementRow[]>;
}
