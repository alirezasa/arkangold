import { IsString, Matches, MinLength, MaxLength } from 'class-validator';

export class LoginPasswordDto {
  @IsString()
  @Matches(/^(?:\+989|09)\d{9}$/, {
    message: 'شماره موبایل باید معتبر و به صورت 09xxxxxxxxx باشد',
  })
  mobile!: string;

  @IsString()
  @MinLength(8, {
    message: 'رمز عبور باید حداقل 8 کاراکتر باشد',
  })
  @MaxLength(32, {
    message: 'رمز عبور نباید بیشتر از 32 کاراکتر باشد',
  })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).+$/, {
    message: 'رمز عبور باید شامل حروف بزرگ، حروف کوچک، عدد و کاراکتر خاص باشد',
  })
  password!: string;
}
