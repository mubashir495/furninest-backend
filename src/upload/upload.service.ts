import {
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuid } from 'uuid';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class UploadService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Upload a single image
   */
  async uploadImage(
    file: Express.Multer.File,
    folder = 'products',
  ): Promise<string> {
    if (!file) {
      throw new InternalServerErrorException('No file uploaded.');
    }

    const extension = file.originalname.split('.').pop();

    const fileName = `${folder}/${uuid()}.${extension}`;

    const bucket =
      this.configService.get<string>('SUPABASE_BUCKET');

    const { error } = await this.supabaseService
      .getClient()
      .storage
      .from(bucket)
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const { data } = this.supabaseService
      .getClient()
      .storage
      .from(bucket)
      .getPublicUrl(fileName);

    return data.publicUrl;
  }

  /**
   * Upload multiple images
   */
  async uploadImages(
    files: Express.Multer.File[],
    folder = 'products',
  ): Promise<string[]> {
    const urls: string[] = [];

    for (const file of files) {
      const url = await this.uploadImage(file, folder);
      urls.push(url);
    }

    return urls;
  }

  /**
   * Delete image from Supabase
   */
  async deleteImage(imageUrl: string): Promise<void> {
    const bucket =
      this.configService.get<string>('SUPABASE_BUCKET');

    const fileName = imageUrl.split('/').slice(-2).join('/');

    const { error } = await this.supabaseService
      .getClient()
      .storage
      .from(bucket)
      .remove([fileName]);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
  }
}