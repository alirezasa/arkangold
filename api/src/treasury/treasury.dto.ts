// api/src/treasury/treasury.dto.ts
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';

export const SUPPLIER_KINDS = [
  'MELTED_GOLD_DEALER',
  'MINT',
  'REFINERY',
  'BANK',
  'OTHER',
] as const;
export const SETTLEMENT_METHODS = [
  'CASH',
  'BANK_TRANSFER',
  'CARD_TO_CARD',
  'POS',
  'CHEQUE',
] as const;

const toBool = ({ value }: { value: unknown }) =>
  value === true || value === 'true'
    ? true
    : value === false || value === 'false'
      ? false
      : undefined;

export class PageQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

export class SupplierDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @IsIn(SUPPLIER_KINDS) kind?: (typeof SUPPLIER_KINDS)[number];
  @IsOptional() @IsString() @MaxLength(20) nationalId?: string;
  @IsOptional() @IsString() @MaxLength(20) economicCode?: string;
  @IsOptional() @IsString() @MaxLength(100) contactPerson?: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional()
  @Matches(/^(IR)?\d{24}$/, { message: 'شبا نامعتبر است' })
  iban?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class ListSuppliersQueryDto extends PageQueryDto {
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @Transform(toBool) @IsBoolean() activeOnly?: boolean;
}

export class TreasuryOrderDto {
  @IsIn(['BUY', 'SELL']) side!: 'BUY' | 'SELL';
  @IsIn(['MELTED_GOLD', 'BULLION']) assetType!: 'MELTED_GOLD' | 'BULLION';
  @IsUUID() supplierId!: string;
  /** وزن ترازو (گرم) */
  @IsNumberString() grossWeightGrams!: string;
  /** عیار به هزارم — آب‌شده معمولاً ۷۰۰ تا ۷۵۰، شمش ۹۹۵ یا ۹۹۹٫۹ */
  @Type(() => Number) @IsInt() @Min(1) @Max(1000) purityMillesimal!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) barCount?: number;
  /** قیمت هر گرم مبنا (آب‌شده: گرم ۷۵۰ — شمش: گرم فیزیکی) به ریال */
  @IsNumberString() pricePerGramRial!: string;
  @IsOptional() @IsNumberString() wageRial?: string;
  @IsOptional() @IsNumberString() feeRial?: string;
  @IsOptional() @IsNumberString() taxRial?: string;
  @IsOptional() @IsString() @MaxLength(60) supplierInvoiceNo?: string;
  @IsOptional() @IsString() @MaxLength(60) assayCertificateNo?: string;
  @IsOptional() @IsString() @MaxLength(100) vaultLocation?: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
  @IsOptional() @IsNumberString() requestedGrams?: string;
}

export class ListOrdersQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(['DRAFT', 'CONFIRMED', 'RECEIVED', 'CANCELLED'])
  status?: string;
  @IsOptional() @IsIn(['BUY', 'SELL']) side?: string;
  @IsOptional() @IsIn(['MELTED_GOLD', 'BULLION']) assetType?: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
}

export class ReceiveOrderDto {
  @IsOptional() @IsString() @MaxLength(100) vaultLocation?: string;
  @IsOptional() @IsString() @MaxLength(60) assayCertificateNo?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class CancelDto {
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

export class SupplierPaymentDto {
  @IsUUID() supplierId!: string;
  @IsOptional() @IsUUID() orderId?: string;
  @IsIn(['PAY', 'RECEIVE']) direction!: 'PAY' | 'RECEIVE';
  @IsNumberString() amountRial!: string;
  @IsIn(SETTLEMENT_METHODS) method!: (typeof SETTLEMENT_METHODS)[number];
  @IsOptional()
  @Matches(/^1010\d*$/, {
    message: 'حساب نقد/بانک باید 1010 یا یکی از زیرحساب‌های آن باشد',
  })
  cashAccountCode?: string;
  @IsOptional() @IsString() @MaxLength(60) referenceNumber?: string;
  @IsOptional() @IsDateString() paidAt?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class VaultCountDto {
  @IsIn(['MELTED_GOLD', 'BULLION']) assetType!: 'MELTED_GOLD' | 'BULLION';
  @IsNumberString() countedGrams!: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class CoverageQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class PurchaseRequestDto {
  @IsUUID() supplierId!: string;
  /** اگر خالی باشد مقدار پیشنهادی گزارش پوشش استفاده می‌شود */
  @IsOptional() @IsNumberString() grams?: string;
  @IsOptional() @IsNumberString() pricePerGramRial?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

// ── موجودی شمش ──

export class BullionQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class BullionItemsQueryDto extends PageQueryDto {
  @IsIn([
    'BLANK',
    'VAULT_CODED',
    'AT_AGENT',
    'SOLD',
    'TRANSFER_PENDING',
    'REVOKED',
    'AWAITING_CODE',
  ])
  bucket!: string;
  @IsOptional() @IsUUID() agentId?: string;
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsString() @MaxLength(40) search?: string;
}

export class CodeBarItemDto {
  @Matches(/^\d{8}$/, { message: 'کد هولوگرام باید ۸ رقم باشد' }) code!: string;
  @IsNumberString() weightGrams!: string;
  @IsIn(['K18', 'K24']) purityKarat!: 'K18' | 'K24';
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsString() @MaxLength(60) factorySerialNumber?: string;
  @IsOptional() @IsDateString() mintedAt?: string;
}

export class CodeBarsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CodeBarItemDto)
  items!: CodeBarItemDto[];
}
