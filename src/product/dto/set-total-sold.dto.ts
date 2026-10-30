import { IsInt, Min } from 'class-validator';

export class SetTotalSoldDto {
  @IsInt()
  @Min(0)
  totalSold: number;
}
