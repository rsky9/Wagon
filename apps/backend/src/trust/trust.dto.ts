import { IsOptional, IsString } from 'class-validator'

export class ReportDto {
  @IsString() reportedId!: string
  @IsOptional() @IsString() tripId?: string
  @IsString() reason!: string
}
