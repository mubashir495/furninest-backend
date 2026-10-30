import {
  IsString, IsNotEmpty, IsOptional, IsArray, IsEnum,
  MaxLength, MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { BlogStatus } from '../schema/blog.schema';

export class CreateBlogDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  /** Optional — auto-generated when omitted */
  @IsOptional()
  @IsString()
  @MaxLength(220)
  @Transform(({ value }) => value?.toLowerCase().trim())
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  excerpt?: string;

  /** Sanitised HTML (done in service, not here) */
  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  coverImage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  author?: string;

  @IsOptional()
  @IsEnum(BlogStatus)
  status?: BlogStatus;

  @IsOptional()
  @IsString()
  @MaxLength(70)
  seoTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(170)
  seoDescription?: string;
}
