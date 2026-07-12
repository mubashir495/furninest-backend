import { IsString, IsNotEmpty, MaxLength, IsMongoId } from 'class-validator';

export class CreateSubCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsMongoId({ message: 'category must be a valid category id' })
  category: string;
}