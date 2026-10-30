import { IsInt, IsString, Min, Max, MinLength, MaxLength } from 'class-validator';

export class CreateReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  comment: string;
}
