import { IsEnum, IsString } from 'class-validator';

export enum OtpType {
  LOGIN = 'LOGIN',
  REGISTER = 'REGISTER',
}

export class SendOtpDto {
  @IsString()
  mobile!: string;

  @IsEnum(OtpType)
  type!: OtpType;
}
