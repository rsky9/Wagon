import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString } from 'class-validator'

export class CreateTruckDto {
  @IsString() truckNo!: string
  @IsString() type!: string
  @IsString() modelId!: string
  @IsOptional() @IsString() capacityId?: string
  @IsOptional() @IsString() driverId?: string
  @IsOptional() @IsString() origin?: string
  @IsOptional() lat?: number
  @IsOptional() lng?: number
  @IsOptional() @IsString() gpsLogin?: string
  @IsOptional() @IsBoolean() activeStatus?: boolean
  @IsOptional() @IsDateString() insuranceUpto?: string
  @IsOptional() @IsDateString() permitUpto?: string
  @IsOptional() @IsDateString() fitnessUpto?: string
  @IsOptional() @IsDateString() pollutionUpto?: string
  @IsOptional() @IsDateString() lastServiceAt?: string
  @IsOptional() @IsNumber() nextServiceKm?: number
  @IsOptional() @IsNumber() odometerKm?: number
}
