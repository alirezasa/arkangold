// admin/app/components/agents/trading.tsx
//
// برچسب‌ها و انواع مشترک خرید و فروش قطعی نمایندگان (پرتال نماینده و کارتابل مدیریت):
// سفارش خرید از شرکت، فروش شمش به شرکت، واریز/برداشت کیف پول و حساب‌های بانکی.

export interface AgentBankAccount {
  id: string;
  bankName: string;
  sheba: string;
  accountNumber: string | null;
  cardNumber: string | null;
  ownerName: string;
  status: "PENDING" | "VERIFIED" | "REJECTED";
  isDefault: boolean;
  rejectionReason: string | null;
  archivedAt?: string | null;
  createdAt: string;
}

export interface PricedItem {
  id: string;
  title: string;
  weightGrams: string;
  purityKarat: "K18" | "K24";
  pricePerGramRial: string;
  unitGoldValueRial: string;
  unitPremiumRial: string;
  unitPriceRial: string;
  consumerMaxPriceRial: string;
  maxPerOrder: number | null;
}

export interface PurchaseOrderItem {
  id: string;
  title: string;
  weightGrams: string;
  purityKarat: string;
  quantity: number;
  unitPriceRial: string;
  unitGoldValueRial: string;
  unitPremiumRial: string;
  lineTotalRial: string;
}

export interface PurchaseOrder {
  id: string;
  orderNumber: string;
  status: string;
  statusLabel: string;
  paymentMethod: "WALLET" | "GATEWAY" | "BANK_TRANSFER" | "CREDIT";
  paymentMethodLabel: string;
  totalWeightGrams: string;
  goldValueRial: string;
  premiumRial: string;
  totalRial: string;
  priceLockedUntil: string;
  lockExpired?: boolean;
  paidAt: string | null;
  paymentReference: string | null;
  proformaInvoiceId: string | null;
  invoiceId: string | null;
  deliveryMethod: string;
  deliveryAddress: string | null;
  voucherNumber: string | null;
  approvedAt: string | null;
  deliveredAt: string | null;
  receiptConfirmedAt: string | null;
  creditDueAt: string | null;
  cancelReason: string | null;
  note: string | null;
  adminNote: string | null;
  createdAt: string;
  agent: { id: string; code: string; name: string; phone?: string };
  items: PurchaseOrderItem[];
  bars?: { code: string; purityKarat: string; factorySerialNumber: string | null; weightGrams: string }[];
  deposits?: {
    id: string;
    requestNumber: string;
    method: string;
    status: string;
    amountRial: string;
    bankReference: string | null;
    transferType: string | null;
    createdAt: string;
  }[];
  wallet?: { balanceRial: string; blockedRial: string; availableRial: string } | null;
}

export interface BuybackOrder {
  id: string;
  orderNumber: string;
  status: string;
  statusLabel: string;
  payoutMethod: "WALLET" | "BANK";
  totalWeightGrams: string;
  quotedTotalRial: string;
  finalTotalRial: string | null;
  deliveryDeadline: string;
  agentInvoiceNumber: string | null;
  agentInvoiceDate: string | null;
  receivedAt: string | null;
  inspectionNote: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  bankReference: string | null;
  rejectionReason: string | null;
  voucherNumber: string | null;
  createdAt: string;
  agent: { id: string; code: string; name: string };
  bankAccount?: { bankName: string; sheba: string; ownerName: string } | null;
  items?: {
    id: string;
    code: string;
    weightGrams: string;
    purityKarat: string;
    pricePerGramRial: string;
    quotedRial: string;
    finalRial: string | null;
    accepted: boolean;
    note: string | null;
  }[];
  _count?: { items: number };
}

const tone = {
  amber: "bg-amber-50 text-amber-700",
  blue: "bg-blue-50 text-blue-700",
  green: "bg-green-50 text-green-700",
  red: "bg-red-50 text-red-600",
  gray: "bg-gray-100 text-gray-500",
  purple: "bg-purple-50 text-purple-700",
};

export const PURCHASE_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING_PAYMENT: { label: "در انتظار پرداخت", cls: tone.amber },
  PAYMENT_REVIEW: { label: "در انتظار تأیید واریز", cls: tone.amber },
  PAID: { label: "پرداخت‌شده — در انتظار تأیید", cls: tone.blue },
  APPROVED: { label: "حواله آماده تحویل", cls: tone.purple },
  DELIVERED: { label: "تحویل‌شده", cls: tone.green },
  CANCELLED: { label: "لغوشده", cls: tone.gray },
  EXPIRED: { label: "منقضی", cls: tone.gray },
};

export const BUYBACK_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING_DELIVERY: { label: "در انتظار تحویل شمش", cls: tone.amber },
  RECEIVED: { label: "دریافت و بازرسی شد", cls: tone.blue },
  APPROVED: { label: "تأییدشده — در انتظار تسویه", cls: tone.purple },
  PAID: { label: "تسویه‌شده", cls: tone.green },
  REJECTED: { label: "ردشده", cls: tone.red },
  CANCELLED: { label: "لغوشده", cls: tone.gray },
};

export const DEPOSIT_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING_PAYMENT: { label: "در انتظار پرداخت", cls: tone.amber },
  PENDING_REVIEW: { label: "در انتظار تأیید مالی", cls: tone.amber },
  APPROVED: { label: "واریز شد", cls: tone.green },
  REJECTED: { label: "رد شد", cls: tone.red },
  FAILED: { label: "ناموفق", cls: tone.red },
  CANCELLED: { label: "لغو شد", cls: tone.gray },
  EXPIRED: { label: "منقضی", cls: tone.gray },
};

export const WITHDRAWAL_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "در انتظار بررسی", cls: tone.amber },
  APPROVED: { label: "در صف پرداخت", cls: tone.blue },
  PAID: { label: "پرداخت شد", cls: tone.green },
  REJECTED: { label: "رد شد", cls: tone.red },
  CANCELLED: { label: "لغو شد", cls: tone.gray },
};

export const BANK_ACCOUNT_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "در انتظار تأیید", cls: tone.amber },
  VERIFIED: { label: "تأییدشده", cls: tone.green },
  REJECTED: { label: "ردشده", cls: tone.red },
};

export const TRANSFER_TYPES = [
  { key: "SATNA", label: "ساتنا" },
  { key: "PAYA", label: "پایا" },
  { key: "POL", label: "پل" },
  { key: "INTERNAL", label: "حساب به حساب (هم‌بانک)" },
  { key: "CARD_TO_CARD", label: "کارت به کارت" },
];

export const PAYMENT_METHODS = [
  { key: "WALLET", label: "کیف پول نمایندگی", hint: "پرداخت فوری از موجودی کیف پول" },
  { key: "GATEWAY", label: "درگاه پرداخت", hint: "مازاد مبلغ بر موجودی کیف پول از درگاه پرداخت می‌شود" },
  { key: "BANK_TRANSFER", label: "واریز بانکی با پیش‌فاکتور", hint: "ساتنا/پایا/پل/حساب به حساب — ثبت مشخصات واریز در مهلت قیمت" },
  { key: "CREDIT", label: "خرید اعتباری", hint: "فقط برای نمایندگان دارای مجوز و در سقف اعتبار" },
] as const;

/** شمارش معکوس تا پایان مهلت قفل قیمت */
export function remainingLabel(until: string, now: number) {
  const ms = new Date(until).getTime() - now;
  if (ms <= 0) return "مهلت تمام شد";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m.toLocaleString("fa-IR")}:${String(s).padStart(2, "0").replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)])}`;
}
