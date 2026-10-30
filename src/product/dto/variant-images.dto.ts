import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsNotEmpty, IsString } from 'class-validator';

export class VariantImageUrlDto {
  @IsString()
  @IsNotEmpty()
  url: string;
}

export class ReorderVariantImagesDto {
  /** Complete list of the variant's current image URLs in the desired order. */
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  images: string[];
}
