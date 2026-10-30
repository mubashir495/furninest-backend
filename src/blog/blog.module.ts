import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BlogPost, BlogSchema } from './schema/blog.schema';
import { BlogController } from './blog.controller';
import { BlogService } from './blog.service';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: BlogPost.name, schema: BlogSchema }]),
    UploadModule,
  ],
  controllers: [BlogController],
  providers: [BlogService],
  exports: [BlogService],
})
export class BlogModule {}
