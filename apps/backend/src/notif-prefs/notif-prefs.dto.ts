import { IsBoolean, IsOptional } from 'class-validator'

export class UpdatePrefsDto {
  @IsOptional() @IsBoolean() loadAlerts?: boolean
  @IsOptional() @IsBoolean() booking?: boolean
  @IsOptional() @IsBoolean() trip?: boolean
  @IsOptional() @IsBoolean() payment?: boolean
  @IsOptional() @IsBoolean() kyc?: boolean
  @IsOptional() @IsBoolean() docExpiry?: boolean
  @IsOptional() @IsBoolean() promo?: boolean
}
