import {
  IsString,
  Length,
  Matches,
  IsDateString,
  IsOptional,
} from "class-validator";

export class SubmitIdentityDto {
  @IsString()
  @Length(2, 50, { message: "نام باید بین ۲ تا ۵۰ کاراکتر باشد" })
  firstName!: string;

  @IsString()
  @Length(2, 50, { message: "نام‌خانوادگی باید بین ۲ تا ۵۰ کاراکتر باشد" })
  lastName!: string;

  @IsString()
  @Length(10, 10, { message: "کد ملی باید ۱۰ رقم باشد" })
  @Matches(/^\d{10}$/, { message: "کد ملی باید فقط شامل اعداد باشد" })
  nationalCode!: string;

  @IsDateString({}, { message: "تاریخ تولد معتبر نیست" })
  birthDate!: string;
}
