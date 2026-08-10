import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator'
import { Type } from 'class-transformer'

export class CreateLoadDto {
  @IsString() pickupAddr!: string
  @IsString() dropAddr!: string
  @IsOptional() @IsString() haltAddr?: string
  @IsLatitude() pickupLat!: number
  @IsLongitude() pickupLng!: number
  @IsLatitude() dropLat!: number
  @IsLongitude() dropLng!: number
  @IsOptional() @IsLatitude() haltLat?: number
  @IsOptional() @IsLongitude() haltLng?: number
  @IsDateString() date!: string
  @IsOptional() @IsDateString() pickupDate?: string
  @IsOptional() @IsDateString() dropDate?: string
  @IsString() truckType!: string
  @IsString() modelId!: string
  @IsNumber() @IsPositive() weight!: number
  @IsNumber() @IsPositive() distanceKm!: number
  @IsString() materialId!: string
  @IsOptional() @IsString() bodyType?: string
  @IsOptional() @IsString() description?: string
  @IsOptional() @IsString() loadingReq?: string
  @IsOptional() @IsString() unloadingReq?: string
  @IsOptional() @IsString() specialReq?: string
  @IsOptional() @IsArray() @IsString({ each: true }) documents?: string[]
  @IsOptional() @IsNumber() @Min(0) advanceAmount?: number
  @IsOptional() @IsString() contactName?: string
  @IsOptional() @IsString() contactPhone?: string
  @IsOptional() @IsNumber() @Min(1) noOfTrucks?: number
  @IsOptional() @IsBoolean() payLater?: boolean
  @IsOptional() @IsString() commercialModel?: string
  @IsOptional() @IsNumber() @Min(0) referenceRate?: number
  @IsOptional() @IsDateString() biddingDeadline?: string
  @IsOptional() @IsNumber() @Min(0) advancePct?: number
  @IsOptional() @IsString() paymentTerms?: string
  @IsOptional() @IsString() extraCharges?: string
}

export class ListLoadsQuery {
  @IsOptional()
  @IsString()
  truckType?: string

  @IsOptional()
  @IsString()
  modelId?: string

  @IsOptional()
  @IsString()
  fromLane?: string

  @IsOptional()
  @IsDateString()
  date?: string

  @IsOptional()
  @IsString()
  materialId?: string

  @IsOptional()
  @IsString()
  q?: string

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minWeight?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxWeight?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pageSize?: number
}
