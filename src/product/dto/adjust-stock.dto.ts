import { IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** Send exactly one of `stock` (absolute) or `delta` (relative, may be negative). */
export class AdjustStockDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  stock?: number;

  @IsOptional() @Type(() => Number) @IsInt()
  delta?: number;
}
