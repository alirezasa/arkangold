// api/src/invoice/invoice.types.ts

export interface CompanySnapshot {
  legalName: string;
  brandName: string;
  companyType: string;
  nationalId: string;
  registrationNumber: string;
  economicCode: string;
  address: string;
  postalCode: string;
  phone: string;
  website: string;
  logoPath: string;
  sealImagePath: string;
}

export interface CustomerSnapshot {
  displayName: string;
  isLegal: boolean;
  nationalId: string | null; // کد ملی (حقیقی) یا شناسه ملی (حقوقی)
  economicCode: string | null;
  registrationNumber: string | null;
  phone: string;
  address: string | null;
  postalCode: string | null;
}

export interface ProformaExtraData {
  depositTrackingId: string;
  destination: {
    owner: string;
    bank: string;
    accountNumber: string;
    sheba: string;
  };
  subject: string;
  legalClauses: string[];
  depositRequestId: string;
  requestNumber: string;
}

/** داده اضافه فاکتور فروش فروشگاه */
export interface SaleInvoiceExtraData {
  discountCode: string | null;
  /** شرح روش پرداخت برای درج در فاکتور (کیف پول / درگاه / ترکیبی) */
  paymentMethod?: string | null;
  /** مبلغ تخفیف کد تخفیف (ریال) — جدا از بسته‌بندی رایگان‌شده که آن هم در ستون تخفیف است */
  discountCodeRial?: number;
  /** مبلغ بسته‌بندی رایگان‌شده به‌دلیل رسیدن خرید به آستانه (ریال) */
  packagingWaivedRial?: number;
  /** فروش حضوری توسط نماینده فروش */
  agentCode?: string;
  agentName?: string;
  agentSaleNumber?: string;
  /** فروش از طریق شریک فروش (خرید اقساطی / اپ همکار) */
  partnerName?: string;
  partnerOrderNumber?: string;
  installmentCount?: number | null;
}

export interface InvoiceItemInput {
  rowNo: number;
  productCode?: string | null;
  title: string;
  unit: string;
  purityKarat?: string | null;
  quantity: number;
  weightGrams?: number | null;
  unitPriceRial: number;
  discountRial?: number;
  makingRial?: number;
  feeRial?: number;
  taxRate?: number;
  taxRial?: number;
  totalRial: number;
  meta?: unknown;
}

/** شکل خروجی API برای رندر سند در فرانت. همه مبالغ به‌صورت string. */
export interface InvoiceDocumentDto {
  id: string;
  kind: 'INVOICE' | 'PROFORMA';
  invoiceNumber: string;
  invoiceNumberFa: string;
  status: string;
  orientation: 'landscape' | 'portrait';

  issuedAt: string;
  issuedAtJalali: string;
  expiresAt: string | null;
  expiresAtJalali: string | null;

  company: CompanySnapshot;
  customer: CustomerSnapshot;
  extra: ProformaExtraData | null;
  /** کد تخفیف اعمال‌شده روی فاکتور فروش (در صورت وجود) */
  discountCode: string | null;
  /** روش پرداخت فاکتور فروش؛ null = پیش‌فرض (کیف پول تومانی) */
  paymentMethod: string | null;
  /** مبلغ تخفیف کد (ریال)؛ null = سند قدیمی (کل ستون تخفیف مربوط به کد است) */
  discountCodeRial: string | null;
  /** مبلغ بسته‌بندی رایگان‌شده (ریال) */
  packagingWaivedRial: string | null;

  items: {
    rowNo: number;
    productCode: string | null;
    title: string;
    unit: string;
    purityKarat: string | null;
    quantity: string;
    weightGrams: string | null;
    unitPriceRial: string;
    discountRial: string;
    makingRial: string;
    feeRial: string;
    taxRate: string;
    taxRial: string;
    totalRial: string;
  }[];

  subtotalRial: string;
  discountRial: string;
  feeRial: string;
  taxRial: string;
  totalRial: string;
  totalInWords: string;

  contentHash: string;
  verifyUrl: string;
  cancelReason: string | null;
}
