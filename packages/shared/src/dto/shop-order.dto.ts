import {
  IsUUID,
  IsString,
  IsOptional,
  IsIn,
  IsNumberString,
  ValidateIf,
  IsArray,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '../enums';
import { ShopOrderItemRecipientDto } from './hologram.dto';

export class CreateShopOrderDto {
  @IsUUID()
  addressId!: string;

  // گیرنده هر آیتم سبد خرید («خرید برای خودم» یا «برای فرد دیگر») — نیازمندی ۳.۳.
  // اگر برای یک cartItemId مشخص نشود، پیش‌فرض SELF در نظر گرفته می‌شود.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShopOrderItemRecipientDto)
  recipients?: ShopOrderItemRecipientDto[];

  // کد تخفیف اختیاری — اعتبار و مبلغ آن در سرور و داخل تراکنش ثبت سفارش بررسی می‌شود
  @IsOptional()
  @IsString()
  @MaxLength(40)
  discountCode?: string;

  // روش ارسال انتخابی مشتری (از گزینه‌های GET /shipping/options برای همین آدرس)؛
  // هزینه‌ی ارسال در سرور و بر اساس تعرفه‌ی روز محاسبه می‌شود
  @IsOptional()
  @IsUUID()
  shippingMethodId?: string;

  // فقط برای روش‌هایی که پس‌کرایه را به انتخاب مشتری گذاشته‌اند: ON_DELIVERY = پرداخت هنگام تحویل
  @IsOptional()
  @IsIn(['PREPAID', 'ON_DELIVERY'])
  shippingFeePayment?: 'PREPAID' | 'ON_DELIVERY';
}

export class ValidateDiscountCodeDto {
  @IsString()
  @MaxLength(40)
  code!: string;
}

export type PaymentModeType = 'WALLET' | 'GATEWAY' | 'SPLIT';

export class PayShopOrderDto {
  @IsIn(['WALLET', 'GATEWAY', 'SPLIT'])
  mode!: PaymentModeType;

  // فقط وقتی GATEWAY یا SPLIT است لازم است
  @ValidateIf((o) => o.mode !== 'WALLET')
  @IsIn(['ZARINPAL', 'BEHPARDAKHT'])
  gatewayProvider?: 'ZARINPAL' | 'BEHPARDAKHT';

  // فقط برای SPLIT
  @ValidateIf((o) => o.mode === 'SPLIT')
  @IsNumberString()
  walletAmountRial?: string;

  @ValidateIf((o) => o.mode === 'SPLIT')
  @IsNumberString()
  gatewayAmountRial?: string;
}

export class ShipShopOrderDto {
  @IsString()
  carrierName!: string;

  @IsOptional()
  @IsString()
  trackingCode?: string;

  @IsOptional()
  @IsString()
  estimatedDelivery?: string;
}

export class CancelShopOrderDto {
  @IsOptional()
  @IsString()
  reason?: string;
}