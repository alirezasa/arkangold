export enum UserType {
  REAL = 'REAL',
  LEGAL = 'LEGAL',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  BANNED = 'BANNED',
  PENDING_ACTIVATION = 'PENDING_ACTIVATION',
}

export enum OtpPurpose {
  REGISTER = 'REGISTER',
  LOGIN = 'LOGIN',
  RESET_PASSWORD = 'RESET_PASSWORD',
}

export enum IdentityStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
  MANUAL_REVIEW = 'MANUAL_REVIEW',
}

export enum HoldType {
  ORDER = 'ORDER',
  WITHDRAWAL = 'WITHDRAWAL',
  PHYSICAL_DELIVERY = 'PHYSICAL_DELIVERY',
}

export enum TransactionType {
  BUY_GOLD = 'BUY_GOLD',
  SELL_GOLD = 'SELL_GOLD',
  BUY_SILVER = 'BUY_SILVER',
  SELL_SILVER = 'SELL_SILVER',
  TRANSFER_IN = 'TRANSFER_IN',
  TRANSFER_OUT = 'TRANSFER_OUT',
  WITHDRAWAL = 'WITHDRAWAL',
  DEPOSIT = 'DEPOSIT',
  FEE = 'FEE',
  TAX = 'TAX',
  REFERRAL_REWARD = 'REFERRAL_REWARD',
  SALARY = 'SALARY',
  PHYSICAL_DELIVERY = 'PHYSICAL_DELIVERY',
  SHOP_PURCHASE = 'SHOP_PURCHASE',
  REFUND = 'REFUND',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum AccountType {
  ASSET = 'ASSET',
  LIABILITY = 'LIABILITY',
  EQUITY = 'EQUITY',
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
}

export enum LedgerSide {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

export enum MetalType {
  GOLD = 'GOLD',
  SILVER = 'SILVER',
}

export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum OrderStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum ProductStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  OUT_OF_STOCK = 'OUT_OF_STOCK',
}

export enum ShopOrderStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  PAID = 'PAID',
  PROCESSING = 'PROCESSING',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentMethod {
  WALLET = 'WALLET',
  BANK_GATEWAY = 'BANK_GATEWAY',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export enum WithdrawalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  PROCESSED = 'PROCESSED',
}

export enum ApprovalType {
  WITHDRAWAL = 'WITHDRAWAL',
  PHYSICAL_DELIVERY = 'PHYSICAL_DELIVERY',
  MANUAL_TRANSACTION = 'MANUAL_TRANSACTION',
}

export enum ApprovalStatus {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum FeeType {
  BUY_GOLD = 'BUY_GOLD',
  SELL_GOLD = 'SELL_GOLD',
  TRANSFER = 'TRANSFER',
  PHYSICAL_DELIVERY = 'PHYSICAL_DELIVERY',
  WITHDRAWAL = 'WITHDRAWAL',
}

export enum TaxType {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum PhysicalDeliveryStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export enum ShippingStatus {
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
}

export enum PayrollStatus {
  SUCCESS = 'SUCCESS',
  PARTIAL = 'PARTIAL',
  FAILED = 'FAILED',
}

export enum VaultInventoryType {
  PHYSICAL = 'PHYSICAL',
  RESERVED = 'RESERVED',
  IN_TRANSIT = 'IN_TRANSIT',
}

export enum SettlementStatus {
  PENDING = 'PENDING',
  SETTLED = 'SETTLED',
  FAILED = 'FAILED',
}

export enum NotificationType {
  SMS = 'SMS',
  IN_APP = 'IN_APP',
  EMAIL = 'EMAIL',
}

export enum ProductPricingMode {
  FIXED = 'FIXED',
  WEIGHT_RANGE = 'WEIGHT_RANGE',
}

export enum InvoiceKind {
  INVOICE = 'INVOICE',
  PROFORMA = 'PROFORMA',
}

export enum InvoiceStatus {
  ISSUED = 'ISSUED',
  PAID = 'PAID',
  CONSUMED = 'CONSUMED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export enum InvoiceSource {
  SHOP_ORDER = 'SHOP_ORDER',
  PHYSICAL_DELIVERY = 'PHYSICAL_DELIVERY',
  DEPOSIT = 'DEPOSIT',
}

export enum DepositMethod {
  ONLINE = 'ONLINE',
  CARD_TO_CARD = 'CARD_TO_CARD',
  BANK_TRANSFER = 'BANK_TRANSFER',
  TRACKING_ID = 'TRACKING_ID',
  LARGE_TRANSFER = 'LARGE_TRANSFER',
  DIRECT = 'DIRECT',
}

export enum DepositStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  RECEIPT_UPLOADED = 'RECEIPT_UPLOADED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export const DEPOSIT_STATUS_LABEL: Record<DepositStatus, string> = {
  [DepositStatus.PENDING_PAYMENT]: 'در انتظار پرداخت',
  [DepositStatus.RECEIPT_UPLOADED]: 'رسید ارسال شد',
  [DepositStatus.UNDER_REVIEW]: 'در حال بررسی',
  [DepositStatus.APPROVED]: 'تایید شد',
  [DepositStatus.REJECTED]: 'رد شد',
  [DepositStatus.CANCELLED]: 'لغو شد',
  [DepositStatus.EXPIRED]: 'منقضی شد',
};

export enum TicketStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  WAITING_FOR_USER = 'WAITING_FOR_USER',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
  REOPENED = 'REOPENED',
}

export enum TicketPriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum TicketSenderType {
  USER = 'USER',
  ADMIN = 'ADMIN',
  SYSTEM = 'SYSTEM',
}

export enum TicketActivityAction {
  TICKET_CREATED = 'TICKET_CREATED',
  TICKET_ASSIGNED = 'TICKET_ASSIGNED',
  TICKET_REASSIGNED = 'TICKET_REASSIGNED',
  STATUS_CHANGED = 'STATUS_CHANGED',
  PRIORITY_CHANGED = 'PRIORITY_CHANGED',
  MESSAGE_SENT = 'MESSAGE_SENT',
  INTERNAL_NOTE_ADDED = 'INTERNAL_NOTE_ADDED',
  FILE_UPLOADED = 'FILE_UPLOADED',
  FILE_DOWNLOADED = 'FILE_DOWNLOADED',
  FILE_DELETED = 'FILE_DELETED',
  TICKET_RESOLVED = 'TICKET_RESOLVED',
  TICKET_CLOSED = 'TICKET_CLOSED',
  TICKET_REOPENED = 'TICKET_REOPENED',
  SLA_BREACHED = 'SLA_BREACHED',
}

// نگاشت گذارهای مجاز وضعیت — مرجع واحد هم برای Backend هم اگر لازم شد Frontend
export const TICKET_STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  [TicketStatus.OPEN]: [TicketStatus.IN_PROGRESS, TicketStatus.RESOLVED],
  [TicketStatus.IN_PROGRESS]: [
    TicketStatus.WAITING_FOR_USER,
    TicketStatus.RESOLVED,
    TicketStatus.OPEN,
  ],
  [TicketStatus.WAITING_FOR_USER]: [TicketStatus.IN_PROGRESS, TicketStatus.OPEN],
  [TicketStatus.RESOLVED]: [TicketStatus.CLOSED, TicketStatus.REOPENED],
  [TicketStatus.CLOSED]: [TicketStatus.REOPENED],
  [TicketStatus.REOPENED]: [TicketStatus.IN_PROGRESS, TicketStatus.OPEN],
};

export const TICKET_STATUS_FA: Record<TicketStatus, string> = {
  [TicketStatus.OPEN]: 'باز',
  [TicketStatus.IN_PROGRESS]: 'در حال بررسی',
  [TicketStatus.WAITING_FOR_USER]: 'در انتظار پاسخ شما',
  [TicketStatus.RESOLVED]: 'حل شده',
  [TicketStatus.CLOSED]: 'بسته شده',
  [TicketStatus.REOPENED]: 'بازگشایی شده',
};

export const TICKET_PRIORITY_FA: Record<TicketPriority, string> = {
  [TicketPriority.LOW]: 'کم',
  [TicketPriority.NORMAL]: 'عادی',
  [TicketPriority.HIGH]: 'بالا',
  [TicketPriority.URGENT]: 'فوری',
};

// ─────────────────── اصالت‌سنجی و انتقال مالکیت شمش (هولوگرام) ───────────────────

export enum ShopOrderItemRecipientType {
  SELF = 'SELF',
  OTHER = 'OTHER',
}

export enum HologramCodeStatus {
  UNASSIGNED = 'UNASSIGNED',
  ASSIGNED = 'ASSIGNED',
  TRANSFER_PENDING = 'TRANSFER_PENDING',
  REVOKED = 'REVOKED',
}

export enum HologramOwnershipStatus {
  ACTIVE = 'ACTIVE',
  TRANSFERRED = 'TRANSFERRED',
  PENDING_RECIPIENT_CONFIRMATION = 'PENDING_RECIPIENT_CONFIRMATION',
}

export enum HologramTransferType {
  INITIAL_PURCHASE = 'INITIAL_PURCHASE',
  GIFT_TRANSFER = 'GIFT_TRANSFER',
  SALE_TRANSFER = 'SALE_TRANSFER',
}

export enum HologramTransferRequestStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export enum HologramInquiryChannel {
  PUBLIC_WEB = 'PUBLIC_WEB',
  APP_PANEL = 'APP_PANEL',
  API_DIRECT = 'API_DIRECT',
}

export enum HologramInquiryResult {
  VALID_ASSIGNED = 'VALID_ASSIGNED',
  VALID_UNASSIGNED = 'VALID_UNASSIGNED',
  INVALID_CODE = 'INVALID_CODE',
}

export const HOLOGRAM_CODE_STATUS_FA: Record<HologramCodeStatus, string> = {
  [HologramCodeStatus.UNASSIGNED]: 'تخصیص‌نیافته',
  [HologramCodeStatus.ASSIGNED]: 'تخصیص‌یافته',
  [HologramCodeStatus.TRANSFER_PENDING]: 'در انتظار تأیید انتقال',
  [HologramCodeStatus.REVOKED]: 'ابطال‌شده',
};

export const HOLOGRAM_TRANSFER_REQUEST_STATUS_FA: Record<HologramTransferRequestStatus, string> = {
  [HologramTransferRequestStatus.PENDING]: 'در انتظار تأیید گیرنده',
  [HologramTransferRequestStatus.CONFIRMED]: 'تأییدشده',
  [HologramTransferRequestStatus.REJECTED]: 'ردشده',
  [HologramTransferRequestStatus.EXPIRED]: 'منقضی‌شده',
  [HologramTransferRequestStatus.CANCELLED]: 'لغوشده',
};

