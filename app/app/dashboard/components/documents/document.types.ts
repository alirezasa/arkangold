// app/app/dashboard/components/documents/document.types.ts

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
  nationalId: string | null;
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

export interface InvoiceLine {
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
}

export interface InvoiceDocument {
  id: string;
  kind: "INVOICE" | "PROFORMA";
  invoiceNumber: string;
  invoiceNumberFa: string;
  status: string;
  orientation: "landscape" | "portrait";
  issuedAt: string;
  issuedAtJalali: string;
  expiresAt: string | null;
  expiresAtJalali: string | null;
  company: CompanySnapshot;
  customer: CustomerSnapshot;
  extra: ProformaExtraData | null;
  /** کد تخفیف اعمال‌شده روی فاکتور فروش */
  discountCode?: string | null;
  items: InvoiceLine[];
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
