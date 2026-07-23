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