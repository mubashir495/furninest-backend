import { IsBoolean } from 'class-validator';

export class UpdateReviewStatusDto {
  @IsBoolean()
  isActive: boolean;
}
