import { IsString } from 'class-validator';

export class RegisterPasswordDto {
  @IsString()
  password!: string;
}
