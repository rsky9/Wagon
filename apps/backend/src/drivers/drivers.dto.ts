import { IsBoolean, IsOptional, IsString } from 'class-validator'

export class CreateDriverDto {
  @IsString()
  name!: string

  @IsString()
  mobile!: string

  @IsOptional()
  @IsString()
  licenseKey?: string

  @IsOptional()
  @IsBoolean()
  status?: boolean
}
