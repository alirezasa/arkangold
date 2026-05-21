export declare enum UserType {
    REAL = "REAL",
    LEGAL = "LEGAL"
}
export declare enum UserStatus {
    ACTIVE = "ACTIVE",
    INACTIVE = "INACTIVE",
    BANNED = "BANNED",
    PENDING_ACTIVATION = "PENDING_ACTIVATION"
}
export declare enum OtpPurpose {
    REGISTER = "REGISTER",
    LOGIN = "LOGIN",
    RESET_PASSWORD = "RESET_PASSWORD"
}
export declare enum IdentityStatus {
    PENDING = "PENDING",
    VERIFIED = "VERIFIED",
    REJECTED = "REJECTED",
    MANUAL_REVIEW = "MANUAL_REVIEW"
}
export declare enum HoldType {
    ORDER = "ORDER",
    WITHDRAWAL = "WITHDRAWAL",
    PHYSICAL_DELIVERY = "PHYSICAL_DELIVERY"
}
export declare enum TransactionType {
    BUY_GOLD = "BUY_GOLD",
    SELL_GOLD = "SELL_GOLD",
    BUY_SILVER = "BUY_SILVER",
    SELL_SILVER = "SELL_SILVER",
    TRANSFER_IN = "TRANSFER_IN",
    TRANSFER_OUT = "TRANSFER_OUT",
    WITHDRAWAL = "WITHDRAWAL",
    DEPOSIT = "DEPOSIT",
    FEE = "FEE",
    TAX = "TAX",
    REFERRAL_REWARD = "REFERRAL_REWARD",
    SALARY = "SALARY",
    PHYSICAL_DELIVERY = "PHYSICAL_DELIVERY",
    SHOP_PURCHASE = "SHOP_PURCHASE",
    REFUND = "REFUND"
}
export declare enum TransactionStatus {
    PENDING = "PENDING",
    COMPLETED = "COMPLETED",
    FAILED = "FAILED"
}
export declare enum AccountType {
    ASSET = "ASSET",
    LIABILITY = "LIABILITY",
    EQUITY = "EQUITY",
    INCOME = "INCOME",
    EXPENSE = "EXPENSE"
}
export declare enum LedgerSide {
    DEBIT = "DEBIT",
    CREDIT = "CREDIT"
}
export declare enum MetalType {
    GOLD = "GOLD",
    SILVER = "SILVER"
}
export declare enum OrderSide {
    BUY = "BUY",
    SELL = "SELL"
}
export declare enum OrderStatus {
    PENDING = "PENDING",
    COMPLETED = "COMPLETED",
    CANCELLED = "CANCELLED"
}
export declare enum ProductStatus {
    ACTIVE = "ACTIVE",
    INACTIVE = "INACTIVE",
    OUT_OF_STOCK = "OUT_OF_STOCK"
}
export declare enum ShopOrderStatus {
    PENDING_PAYMENT = "PENDING_PAYMENT",
    PAID = "PAID",
    PROCESSING = "PROCESSING",
    SHIPPED = "SHIPPED",
    DELIVERED = "DELIVERED",
    CANCELLED = "CANCELLED"
}
export declare enum PaymentMethod {
    WALLET = "WALLET",
    BANK_GATEWAY = "BANK_GATEWAY"
}
export declare enum PaymentStatus {
    PENDING = "PENDING",
    SUCCESS = "SUCCESS",
    FAILED = "FAILED"
}
export declare enum WithdrawalStatus {
    PENDING = "PENDING",
    APPROVED = "APPROVED",
    REJECTED = "REJECTED",
    PROCESSED = "PROCESSED"
}
export declare enum ApprovalType {
    WITHDRAWAL = "WITHDRAWAL",
    PHYSICAL_DELIVERY = "PHYSICAL_DELIVERY",
    MANUAL_TRANSACTION = "MANUAL_TRANSACTION"
}
export declare enum ApprovalStatus {
    APPROVED = "APPROVED",
    REJECTED = "REJECTED"
}
export declare enum FeeType {
    BUY_GOLD = "BUY_GOLD",
    SELL_GOLD = "SELL_GOLD",
    TRANSFER = "TRANSFER",
    PHYSICAL_DELIVERY = "PHYSICAL_DELIVERY",
    WITHDRAWAL = "WITHDRAWAL"
}
export declare enum TaxType {
    BUY = "BUY",
    SELL = "SELL"
}
export declare enum PhysicalDeliveryStatus {
    PENDING = "PENDING",
    APPROVED = "APPROVED",
    SHIPPED = "SHIPPED",
    DELIVERED = "DELIVERED",
    CANCELLED = "CANCELLED"
}
export declare enum ShippingStatus {
    IN_TRANSIT = "IN_TRANSIT",
    DELIVERED = "DELIVERED",
    FAILED = "FAILED"
}
export declare enum PayrollStatus {
    SUCCESS = "SUCCESS",
    PARTIAL = "PARTIAL",
    FAILED = "FAILED"
}
export declare enum VaultInventoryType {
    PHYSICAL = "PHYSICAL",
    RESERVED = "RESERVED",
    IN_TRANSIT = "IN_TRANSIT"
}
export declare enum SettlementStatus {
    PENDING = "PENDING",
    SETTLED = "SETTLED",
    FAILED = "FAILED"
}
export declare enum NotificationType {
    SMS = "SMS",
    IN_APP = "IN_APP",
    EMAIL = "EMAIL"
}
