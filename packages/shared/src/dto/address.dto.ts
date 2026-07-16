import { IsString, IsOptional, Length } from "class-validator";

export class CreateAddressDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  province?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsString()
  @Length(10, 500, { message: "آدرس باید بین ۱۰ تا ۵۰۰ کاراکتر باشد" })
  fullAddress!: string;

  @IsOptional()
  @IsString()
  receiverName?: string;

  @IsOptional()
  @IsString()
  @Length(11, 11, { message: "شماره تماس گیرنده باید ۱۱ رقم باشد" })
  receiverPhone?: string;
}
