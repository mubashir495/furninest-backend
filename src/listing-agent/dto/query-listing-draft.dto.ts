import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ListingDraftStatus } from '../schemas/listing-draft.schema';

export class QueryListingDraftDto {
  @IsOptional()
  @IsEnum(ListingDraftStatus)
  status?: ListingDraftStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
