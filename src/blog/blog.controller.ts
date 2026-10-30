import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, UseInterceptors,
  UploadedFile, ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BlogService } from './blog.service';
import { CreateBlogDto } from './dto/create-blog.dto';
import { UpdateBlogDto } from './dto/update-blog.dto';
import { BlogQueryDto } from './dto/blog-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { multerOptions } from '../common/multer/multer.config';

const queryPipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: false });

@Controller()
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  // ── Public ──────────────────────────────────────────────────────────────

  @Get('blog')
  findAll(@Query(queryPipe) query: BlogQueryDto) {
    return this.blogService.findAllPublic(query);
  }

  @Get('blog/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.blogService.findBySlug(slug);
  }

  // ── Admin ────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('admin/blog')
  findAllAdmin(@Query(queryPipe) query: BlogQueryDto) {
    return this.blogService.findAllAdmin(query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('admin/blog/:id')
  findOneAdmin(@Param('id') id: string) {
    return this.blogService.findOneAdmin(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('admin/blog')
  create(@Body() dto: CreateBlogDto) {
    return this.blogService.create(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('admin/blog/:id')
  update(@Param('id') id: string, @Body() dto: UpdateBlogDto) {
    return this.blogService.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete('admin/blog/:id')
  remove(@Param('id') id: string) {
    return this.blogService.remove(id);
  }

  /**
   * Image upload for blog posts (Tiptap editor + cover image).
   * Stores to Supabase "blog/" folder.
   * Returns { url } for use by Tiptap's upload callback.
   *
   * To switch to Cloudinary / S3: inject a StorageService here instead of
   * UploadService directly.  The BlogService already delegates to UploadService
   * which can be swapped out without changing this controller.
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('admin/upload')
  @UseInterceptors(FileInterceptor('file', multerOptions))
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    const url = await this.blogService.uploadImage(file);
    return { success: true, url };
  }
}
