import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from "class-validator";

/**
 * آدرس تحویل کاربر. استان با کد استاندارد (provinceCode، مثلاً TEHRAN) انتخاب می‌شود تا
 * منطقه و تعرفه‌ی ارسال قابل تطبیق باشد؛ province (نام متنی) فقط برای سازگاری با نسخه‌های قدیمی است.
 */
export class CreateAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  provinceCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  province?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  city?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(\d{10})?$/, { message: "کد پستی باید ۱۰ رقم باشد" })
  postalCode?: string;

  @IsString()
  @Length(10, 500, { message: "آدرس باید بین ۱۰ تا ۵۰۰ کاراکتر باشد" })
  fullAddress!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  plaque?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  receiverName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(09\d{9})?$/, { message: "شماره موبایل گیرنده باید ۱۱ رقم و با ۰۹ شروع شود" })
  receiverPhone?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

/** ویرایش آدرس — همه فیلدها اختیاری */
export class UpdateAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  provinceCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  city?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(\d{10})?$/, { message: "کد پستی باید ۱۰ رقم باشد" })
  postalCode?: string;

  @IsOptional()
  @IsString()
  @Length(10, 500, { message: "آدرس باید بین ۱۰ تا ۵۰۰ کاراکتر باشد" })
  fullAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  plaque?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  receiverName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(09\d{9})?$/, { message: "شماره موبایل گیرنده باید ۱۱ رقم و با ۰۹ شروع شود" })
  receiverPhone?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
