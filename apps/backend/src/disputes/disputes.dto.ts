import { IsArray, IsOptional, IsString } from 'class-validator'

export class RaiseDto {
  @IsString() tripId!: string
  @IsString() subject!: string
  @IsOptional() @IsString() issueType?: string
  @IsOptional() @IsArray() @IsString({ each: true }) evidenceKeys?: string[]
}
