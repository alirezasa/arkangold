"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationType = exports.SettlementStatus = exports.VaultInventoryType = exports.PayrollStatus = exports.ShippingStatus = exports.PhysicalDeliveryStatus = exports.TaxType = exports.FeeType = exports.ApprovalStatus = exports.ApprovalType = exports.WithdrawalStatus = exports.PaymentStatus = exports.PaymentMethod = exports.ShopOrderStatus = exports.ProductStatus = exports.OrderStatus = exports.OrderSide = exports.MetalType = exports.LedgerSide = exports.AccountType = exports.TransactionStatus = exports.TransactionType = exports.HoldType = exports.IdentityStatus = exports.OtpPurpose = exports.UserStatus = exports.UserType = void 0;
var UserType;
(function (UserType) {
    UserType["REAL"] = "REAL";
    UserType["LEGAL"] = "LEGAL";
})(UserType || (exports.UserType = UserType = {}));
var UserStatus;
(function (UserStatus) {
    UserStatus["ACTIVE"] = "ACTIVE";
    UserStatus["INACTIVE"] = "INACTIVE";
    UserStatus["BANNED"] = "BANNED";
    UserStatus["PENDING_ACTIVATION"] = "PENDING_ACTIVATION";
})(UserStatus || (exports.UserStatus = UserStatus = {}));
var OtpPurpose;
(function (OtpPurpose) {
    OtpPurpose["REGISTER"] = "REGISTER";
    OtpPurpose["LOGIN"] = "LOGIN";
    OtpPurpose["RESET_PASSWORD"] = "RESET_PASSWORD";
})(OtpPurpose || (exports.OtpPurpose = OtpPurpose = {}));
var IdentityStatus;
(function (IdentityStatus) {
    IdentityStatus["PENDING"] = "PENDING";
    IdentityStatus["VERIFIED"] = "VERIFIED";
    IdentityStatus["REJECTED"] = "REJECTED";
    IdentityStatus["MANUAL_REVIEW"] = "MANUAL_REVIEW";
})(IdentityStatus || (exports.IdentityStatus = IdentityStatus = {}));
var HoldType;
(function (HoldType) {
    HoldType["ORDER"] = "ORDER";
    HoldType["WITHDRAWAL"] = "WITHDRAWAL";
    HoldType["PHYSICAL_DELIVERY"] = "PHYSICAL_DELIVERY";
})(HoldType || (exports.HoldType = HoldType = {}));
var TransactionType;
(function (TransactionType) {
    TransactionType["BUY_GOLD"] = "BUY_GOLD";
    TransactionType["SELL_GOLD"] = "SELL_GOLD";
    TransactionType["BUY_SILVER"] = "BUY_SILVER";
    TransactionType["SELL_SILVER"] = "SELL_SILVER";
    TransactionType["TRANSFER_IN"] = "TRANSFER_IN";
    TransactionType["TRANSFER_OUT"] = "TRANSFER_OUT";
    TransactionType["WITHDRAWAL"] = "WITHDRAWAL";
    TransactionType["DEPOSIT"] = "DEPOSIT";
    TransactionType["FEE"] = "FEE";
    TransactionType["TAX"] = "TAX";
    TransactionType["REFERRAL_REWARD"] = "REFERRAL_REWARD";
    TransactionType["SALARY"] = "SALARY";
    TransactionType["PHYSICAL_DELIVERY"] = "PHYSICAL_DELIVERY";
    TransactionType["SHOP_PURCHASE"] = "SHOP_PURCHASE";
    TransactionType["REFUND"] = "REFUND";
})(TransactionType || (exports.TransactionType = TransactionType = {}));
var TransactionStatus;
(function (TransactionStatus) {
    TransactionStatus["PENDING"] = "PENDING";
    TransactionStatus["COMPLETED"] = "COMPLETED";
    TransactionStatus["FAILED"] = "FAILED";
})(TransactionStatus || (exports.TransactionStatus = TransactionStatus = {}));
var AccountType;
(function (AccountType) {
    AccountType["ASSET"] = "ASSET";
    AccountType["LIABILITY"] = "LIABILITY";
    AccountType["EQUITY"] = "EQUITY";
    AccountType["INCOME"] = "INCOME";
    AccountType["EXPENSE"] = "EXPENSE";
})(AccountType || (exports.AccountType = AccountType = {}));
var LedgerSide;
(function (LedgerSide) {
    LedgerSide["DEBIT"] = "DEBIT";
    LedgerSide["CREDIT"] = "CREDIT";
})(LedgerSide || (exports.LedgerSide = LedgerSide = {}));
var MetalType;
(function (MetalType) {
    MetalType["GOLD"] = "GOLD";
    MetalType["SILVER"] = "SILVER";
})(MetalType || (exports.MetalType = MetalType = {}));
var OrderSide;
(function (OrderSide) {
    OrderSide["BUY"] = "BUY";
    OrderSide["SELL"] = "SELL";
})(OrderSide || (exports.OrderSide = OrderSide = {}));
var OrderStatus;
(function (OrderStatus) {
    OrderStatus["PENDING"] = "PENDING";
    OrderStatus["COMPLETED"] = "COMPLETED";
    OrderStatus["CANCELLED"] = "CANCELLED";
})(OrderStatus || (exports.OrderStatus = OrderStatus = {}));
var ProductStatus;
(function (ProductStatus) {
    ProductStatus["ACTIVE"] = "ACTIVE";
    ProductStatus["INACTIVE"] = "INACTIVE";
    ProductStatus["OUT_OF_STOCK"] = "OUT_OF_STOCK";
})(ProductStatus || (exports.ProductStatus = ProductStatus = {}));
var ShopOrderStatus;
(function (ShopOrderStatus) {
    ShopOrderStatus["PENDING_PAYMENT"] = "PENDING_PAYMENT";
    ShopOrderStatus["PAID"] = "PAID";
    ShopOrderStatus["PROCESSING"] = "PROCESSING";
    ShopOrderStatus["SHIPPED"] = "SHIPPED";
    ShopOrderStatus["DELIVERED"] = "DELIVERED";
    ShopOrderStatus["CANCELLED"] = "CANCELLED";
})(ShopOrderStatus || (exports.ShopOrderStatus = ShopOrderStatus = {}));
var PaymentMethod;
(function (PaymentMethod) {
    PaymentMethod["WALLET"] = "WALLET";
    PaymentMethod["BANK_GATEWAY"] = "BANK_GATEWAY";
})(PaymentMethod || (exports.PaymentMethod = PaymentMethod = {}));
var PaymentStatus;
(function (PaymentStatus) {
    PaymentStatus["PENDING"] = "PENDING";
    PaymentStatus["SUCCESS"] = "SUCCESS";
    PaymentStatus["FAILED"] = "FAILED";
})(PaymentStatus || (exports.PaymentStatus = PaymentStatus = {}));
var WithdrawalStatus;
(function (WithdrawalStatus) {
    WithdrawalStatus["PENDING"] = "PENDING";
    WithdrawalStatus["APPROVED"] = "APPROVED";
    WithdrawalStatus["REJECTED"] = "REJECTED";
    WithdrawalStatus["PROCESSED"] = "PROCESSED";
})(WithdrawalStatus || (exports.WithdrawalStatus = WithdrawalStatus = {}));
var ApprovalType;
(function (ApprovalType) {
    ApprovalType["WITHDRAWAL"] = "WITHDRAWAL";
    ApprovalType["PHYSICAL_DELIVERY"] = "PHYSICAL_DELIVERY";
    ApprovalType["MANUAL_TRANSACTION"] = "MANUAL_TRANSACTION";
})(ApprovalType || (exports.ApprovalType = ApprovalType = {}));
var ApprovalStatus;
(function (ApprovalStatus) {
    ApprovalStatus["APPROVED"] = "APPROVED";
    ApprovalStatus["REJECTED"] = "REJECTED";
})(ApprovalStatus || (exports.ApprovalStatus = ApprovalStatus = {}));
var FeeType;
(function (FeeType) {
    FeeType["BUY_GOLD"] = "BUY_GOLD";
    FeeType["SELL_GOLD"] = "SELL_GOLD";
    FeeType["TRANSFER"] = "TRANSFER";
    FeeType["PHYSICAL_DELIVERY"] = "PHYSICAL_DELIVERY";
    FeeType["WITHDRAWAL"] = "WITHDRAWAL";
})(FeeType || (exports.FeeType = FeeType = {}));
var TaxType;
(function (TaxType) {
    TaxType["BUY"] = "BUY";
    TaxType["SELL"] = "SELL";
})(TaxType || (exports.TaxType = TaxType = {}));
var PhysicalDeliveryStatus;
(function (PhysicalDeliveryStatus) {
    PhysicalDeliveryStatus["PENDING"] = "PENDING";
    PhysicalDeliveryStatus["APPROVED"] = "APPROVED";
    PhysicalDeliveryStatus["SHIPPED"] = "SHIPPED";
    PhysicalDeliveryStatus["DELIVERED"] = "DELIVERED";
    PhysicalDeliveryStatus["CANCELLED"] = "CANCELLED";
})(PhysicalDeliveryStatus || (exports.PhysicalDeliveryStatus = PhysicalDeliveryStatus = {}));
var ShippingStatus;
(function (ShippingStatus) {
    ShippingStatus["IN_TRANSIT"] = "IN_TRANSIT";
    ShippingStatus["DELIVERED"] = "DELIVERED";
    ShippingStatus["FAILED"] = "FAILED";
})(ShippingStatus || (exports.ShippingStatus = ShippingStatus = {}));
var PayrollStatus;
(function (PayrollStatus) {
    PayrollStatus["SUCCESS"] = "SUCCESS";
    PayrollStatus["PARTIAL"] = "PARTIAL";
    PayrollStatus["FAILED"] = "FAILED";
})(PayrollStatus || (exports.PayrollStatus = PayrollStatus = {}));
var VaultInventoryType;
(function (VaultInventoryType) {
    VaultInventoryType["PHYSICAL"] = "PHYSICAL";
    VaultInventoryType["RESERVED"] = "RESERVED";
    VaultInventoryType["IN_TRANSIT"] = "IN_TRANSIT";
})(VaultInventoryType || (exports.VaultInventoryType = VaultInventoryType = {}));
var SettlementStatus;
(function (SettlementStatus) {
    SettlementStatus["PENDING"] = "PENDING";
    SettlementStatus["SETTLED"] = "SETTLED";
    SettlementStatus["FAILED"] = "FAILED";
})(SettlementStatus || (exports.SettlementStatus = SettlementStatus = {}));
var NotificationType;
(function (NotificationType) {
    NotificationType["SMS"] = "SMS";
    NotificationType["IN_APP"] = "IN_APP";
    NotificationType["EMAIL"] = "EMAIL";
})(NotificationType || (exports.NotificationType = NotificationType = {}));
//# sourceMappingURL=index.js.map