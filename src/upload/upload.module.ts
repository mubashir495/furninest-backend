import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { UploadService } from './upload.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [
    ConfigModule,
    SupabaseModule,
  ],
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}