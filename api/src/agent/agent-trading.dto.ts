// api/src/agent/agent-trading.dto.ts
//
// DTOهای خرید و فروش قطعی نمایندگان: حساب بانکی، کیف پول (واریز/برداشت)، فهرست قیمت،
// سفارش خرید شمش از شرکت و فروش شمش به شرکت. مبالغ همه به ریال.
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { DateRangeQueryDto, GOLD_PURITIES } from './agent.dto';

const SHEBA = /^IR\d{24}$/;
const CARD = /^\d{16}$/;
const HOLOGRAM_CODE = /^\d{8}$/;

const toUpperTrim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/[\s-]/g, '').toUpperCase() : value;
const toDigits = ({ value }: { value: unknown }) =>
  typeof value === 'string'
    ? value
        .replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
        .replace(/\D/g, '')
    : value;

export const GATEWAY_KEYS = ['ZARINPAL', 'BEHPARDAKHT'] as const;
export const TRANSFER_TYPES = [
  'PAYA',
  'SATNA',
  'POL',
  'INTERNAL',
  'CARD_TO_CARD',
] as const;

export const TRANSFER_TYPE_FA: Record<string, string> = {
  PAYA: 'پایا',
  SATNA: 'ساتنا',
  POL: 'پل',
  INTERNAL: 'حساب به حساب (هم‌بانک)',
  CARD_TO_CARD: 'کارت به کارت',
};

// ─────────────────────────── حساب بانکی ───────────────────────────

export class CreateAgentBankAccountDto {
  @IsString()
  @Length(2, 60)
  bankName!: string;

  @Transform(toUpperTrim)
  @Matches(SHEBA, { message: 'شماره شبا باید با IR و ۲۴ رقم باشد' })
  sheba!: string;

  @IsOptional()
  @Transform(toDigits)
  @IsString()
  @MaxLength(30)
  accountNumber?: string;

  @IsOptional()
  @Transform(toDigits)
  @ValidateIf((o: CreateAgentBankAccountDto) => !!o.cardNumber)
  @Matches(CARD, { message: 'شماره کارت باید ۱۶ رقم باشد' })
  cardNumber?: string;

  /** نام صاحب حساب — باید با نام نماینده (یا شخص حقوقی نماینده) یکی باشد */
  @IsString()
  @Length(3, 120)
  ownerName!: string;
}

export class ReviewBankAccountDto {
  @IsBoolean()
  approve!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

// ─────────────────────────── واریز به کیف پول ───────────────────────────

export class CreateAgentDepositDto {
  @Type(() => Number)
  @IsInt()
  @Min(10_000, { message: 'حداقل مبلغ واریز ۱۰٬۰۰۰ ریال است' })
  amountRial!: number;

  @IsIn(['GATEWAY', 'BANK_TRANSFER'])
  method!: 'GATEWAY' | 'BANK_TRANSFER';

  @ValidateIf((o: CreateAgentDepositDto) => o.method === 'GATEWAY')
  @IsIn(GATEWAY_KEYS)
  gateway?: (typeof GATEWAY_KEYS)[number];

  @ValidateIf((o: CreateAgentDepositDto) => o.method === 'BANK_TRANSFER')
  @IsIn(TRANSFER_TYPES)
  transferType?: (typeof TRANSFER_TYPES)[number];

  /** حساب مبدأ — باید یکی از حساب‌های تأییدشده‌ی خود نماینده باشد (بند ۵-۱ قرارداد) */
  @ValidateIf((o: CreateAgentDepositDto) => o.method === 'BANK_TRANSFER')
  @IsUUID()
  sourceBankAccountId?: string;

  @ValidateIf((o: CreateAgentDepositDto) => o.method === 'BANK_TRANSFER')
  @IsString()
  @Length(4, 60, { message: 'شماره پیگیری/مرجع واریز را وارد کنید' })
  bankReference?: string;

  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

// ─────────────────────────── برداشت ───────────────────────────

export class CreateAgentWithdrawalDto {
  @Type(() => Number)
  @IsInt()
  @Min(100_000, { message: 'حداقل مبلغ برداشت ۱۰۰٬۰۰۰ ریال است' })
  amountRial!: number;

  @IsUUID()
  bankAccountId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class PayAgentWithdrawalDto {
  @IsString()
  @Length(4, 60, { message: 'شماره پیگیری پرداخت بانکی را وارد کنید' })
  bankReference!: string;
}

export class ReasonDto {
  @IsString()
  @MinLength(5, { message: 'دلیل را وارد کنید' })
  @MaxLength(500)
  reason!: string;
}

export class WalletAdjustmentDto {
  @IsIn(['CREDIT', 'DEBIT'])
  direction!: 'CREDIT' | 'DEBIT';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountRial!: number;

  @IsString()
  @MinLength(10, { message: 'شرح اصلاحیه باید حداقل ۱۰ کاراکتر باشد' })
  @MaxLength(500)
  reason!: string;
}

export class SettleDebtFromWalletDto {
  @Type(() => Number)
  @IsInt()
  @Min(10_000)
  amountRial!: number;
}

// ─────────────────────────── فهرست قیمت نمایندگی ───────────────────────────

export class AgentPriceItemDto {
  @IsString()
  @Length(2, 120)
  title!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  @Max(10000)
  weightGrams!: number;

  @IsIn(GOLD_PURITIES)
  purityKarat!: (typeof GOLD_PURITIES)[number];

  @Type(() => Number)
  @IsInt()
  @Min(0)
  premiumRial!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  consumerPremiumRial!: number;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxPerOrder?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

export class UpdateAgentPriceItemDto {
  @IsOptional() @IsString() @Length(2, 120) title?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) premiumRial?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  consumerPremiumRial?: number;
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxPerOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

// ─────────────────────────── سفارش خرید از شرکت ───────────────────────────

export class PurchaseOrderItemDto {
  @IsUUID()
  priceItemId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  quantity!: number;
}

export class CreatePurchaseOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items!: PurchaseOrderItemDto[];

  @IsIn(['WALLET', 'GATEWAY', 'BANK_TRANSFER', 'CREDIT'])
  paymentMethod!: 'WALLET' | 'GATEWAY' | 'BANK_TRANSFER' | 'CREDIT';

  @ValidateIf((o: CreatePurchaseOrderDto) => o.paymentMethod === 'GATEWAY')
  @IsIn(GATEWAY_KEYS)
  gateway?: (typeof GATEWAY_KEYS)[number];

  @IsIn(['IN_PERSON', 'SHIPPING'])
  deliveryMethod!: 'IN_PERSON' | 'SHIPPING';

  @ValidateIf((o: CreatePurchaseOrderDto) => o.deliveryMethod === 'SHIPPING')
  @IsString()
  @Length(10, 500, { message: 'نشانی تحویل را کامل وارد کنید' })
  deliveryAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** ثبت مشخصات واریز بانکی سفارش (در مهلت قفل قیمت) */
export class SubmitOrderTransferDto {
  @IsUUID()
  sourceBankAccountId!: string;

  @IsIn(TRANSFER_TYPES)
  transferType!: (typeof TRANSFER_TYPES)[number];

  @IsString()
  @Length(4, 60, { message: 'شماره پیگیری/مرجع واریز را وارد کنید' })
  bankReference!: string;

  @IsOptional()
  @IsDateString()
  paidAt?: string;
}

export class PayOrderDto {
  @IsIn(['WALLET', 'GATEWAY'])
  method!: 'WALLET' | 'GATEWAY';

  @ValidateIf((o: PayOrderDto) => o.method === 'GATEWAY')
  @IsIn(GATEWAY_KEYS)
  gateway?: (typeof GATEWAY_KEYS)[number];
}

export class ApprovePurchaseOrderDto {
  /** کد هولوگرام شمش‌های کددار خزانه که به این سفارش تخصیص داده می‌شوند */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @Matches(HOLOGRAM_CODE, {
    each: true,
    message: 'کد هولوگرام باید ۸ رقم باشد',
  })
  codes!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  adminNote?: string;
}

export class MarkDeliveredDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

// ─────────────────────────── فروش شمش به شرکت ───────────────────────────

export class CreateBuybackOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @Matches(HOLOGRAM_CODE, {
    each: true,
    message: 'کد هولوگرام باید ۸ رقم باشد',
  })
  codes!: string[];

  @IsIn(['WALLET', 'BANK'])
  payoutMethod!: 'WALLET' | 'BANK';

  @ValidateIf((o: CreateBuybackOrderDto) => o.payoutMethod === 'BANK')
  @IsUUID()
  bankAccountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class BuybackQuoteDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @Matches(HOLOGRAM_CODE, {
    each: true,
    message: 'کد هولوگرام باید ۸ رقم باشد',
  })
  codes!: string[];
}

export class BuybackInspectionItemDto {
  @Matches(HOLOGRAM_CODE)
  code!: string;

  @IsBoolean()
  accepted!: boolean;

  /** مبلغ نهایی پس از عیارسنجی — خالی = همان مبلغ قفل‌شده */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  finalRial?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class ReceiveBuybackDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BuybackInspectionItemDto)
  items!: BuybackInspectionItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  inspectionNote?: string;
}

/** ثبت صورتحساب الکترونیک نماینده به نام شرکت (فروشنده نماینده است) */
export class BuybackAgentInvoiceDto {
  @IsString()
  @Length(4, 60, { message: 'شماره صورتحساب (سامانه مؤدیان) را وارد کنید' })
  agentInvoiceNumber!: string;

  @IsDateString({}, { message: 'تاریخ صورتحساب معتبر نیست' })
  agentInvoiceDate!: string;
}

export class PayBuybackDto {
  @IsOptional()
  @IsString()
  @Length(4, 60)
  bankReference?: string;
}

// ─────────────────────────── فهرست‌ها ───────────────────────────

export class TradingListQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @IsUUID()
  agentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  search?: string;
}

export class WalletTxQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  type?: string;
}

export class InvoiceListQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @IsIn(['INVOICE', 'PROFORMA'])
  kind?: 'INVOICE' | 'PROFORMA';
}
