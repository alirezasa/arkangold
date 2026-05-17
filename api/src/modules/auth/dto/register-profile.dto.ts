import { IsString } from 'class-validator';
import { IsNationalCode } from '../../../common/validators/is-national-code.validator';

export class RegisterProfileDto {
  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsString()
  @IsNationalCode({
    message: 'کد ملی معتبر نیست',
  })
  nationalCode!: string;

  @IsString()
  birthDate!: string;
}
