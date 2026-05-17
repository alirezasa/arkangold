import { IsString } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  mobile!: string;

  @IsString()
  code!: string;
}
