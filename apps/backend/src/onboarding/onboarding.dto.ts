import { IsArray, IsNumber, IsOptional, IsString, Min } from 'class-validator'

export class TransporterDto {
  @IsOptional() @IsString() companyName?: string
  @IsOptional() @IsString() ownerName?: string
  @IsOptional() @IsString() pan?: string
  @IsOptional() @IsString() aadhar?: string
  @IsOptional() @IsNumber() @Min(1) fleetSize?: number
  @IsOptional() @IsString() bankAccount?: string
  @IsOptional() @IsString() ifsc?: string
  @IsOptional() @IsString() acctHolder?: string
  @IsOptional() @IsString() insuranceKey?: string
  @IsOptional() @IsString() permitKey?: string
  @IsOptional() @IsString() fitnessKey?: string
  @IsOptional() @IsString() pollutionKey?: string
}

export class SupplierDto {
  @IsOptional() @IsString() companyName?: string
  @IsOptional() @IsString() gst?: string
  @IsOptional() @IsString() pan?: string
  @IsOptional() @IsString() cin?: string
  @IsOptional() @IsString() tan?: string
  @IsOptional() @IsString() billingAddress?: string
  @IsOptional() @IsArray() @IsString({ each: true }) pickupLocations?: string[]
  @IsOptional() @IsArray() @IsString({ each: true }) frequentDestinations?: string[]
  @IsOptional() @IsString() preferredPayment?: string
}
