import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { IOptions as SanitizeOptions } from 'sanitize-html';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sanitizeHtml: (html: string, opts?: SanitizeOptions) => string = require('sanitize-html');
import { BlogPost, BlogDocument, BlogStatus } from './schema/blog.schema';
import { CreateBlogDto } from './dto/create-blog.dto';
import { UpdateBlogDto } from './dto/update-blog.dto';
import { BlogQueryDto } from './dto/blog-query.dto';
import { UploadService } from '../upload/upload.service';

// ── Helpers ──────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');
}

function calcReadTime(html: string): number {
  const text = html.replace(/<[^>]*>/g, ' ');
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** Allowed HTML tags / attributes for blog content */
const SANITIZE_OPTIONS: SanitizeOptions = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'strong', 'em', 'u', 's',
    'ul', 'ol', 'li',
    'a', 'img',
    'blockquote', 'pre', 'code',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'figure', 'figcaption', 'div', 'span',
    'hr',
  ],
  allowedAttributes: {
    'a': ['href', 'target', 'rel'],
    'img': ['src', 'alt', 'width', 'height'],
    '*': ['class'],
  },
  allowedSchemes: ['http', 'https', 'data'],
};

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class BlogService {
  constructor(
    @InjectModel(BlogPost.name)
    private readonly blogModel: Model<BlogDocument>,
    private readonly uploadService: UploadService,
  ) {}

  // ── Slug generation ───────────────────────────────────────────────────────

  private async generateUniqueSlug(title: string, excludeId?: string): Promise<string> {
    const base = slugify(title);
    let candidate = base;
    let counter = 1;
    while (
      await this.blogModel.exists({
        slug: candidate,
        ...(excludeId ? { _id: { $ne: excludeId } } : {}),
      })
    ) {
      candidate = `${base}-${++counter}`;
    }
    return candidate;
  }

  // ── Public routes ────────────────────────────────────────────────────────

  async findAllPublic(query: BlogQueryDto) {
    const filter: Record<string, any> = { status: BlogStatus.PUBLISHED };
    if (query.category) filter.category = { $regex: query.category, $options: 'i' };
    if (query.search) {
      const rx = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ title: rx }, { excerpt: rx }, { tags: rx }];
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const [posts, total] = await Promise.all([
      this.blogModel
        .find(filter)
        .select('-content')       // exclude heavy content from list
        .sort({ publishedAt: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.blogModel.countDocuments(filter),
    ]);

    return {
      success: true,
      data: posts,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findBySlug(slug: string) {
    const post = await this.blogModel.findOne({ slug, status: BlogStatus.PUBLISHED });
    if (!post) throw new NotFoundException('Blog post not found.');
    return { success: true, data: post };
  }

  // ── Admin routes ─────────────────────────────────────────────────────────

  async findAllAdmin(query: BlogQueryDto) {
    const filter: Record<string, any> = {};
    if (query.status) filter.status = query.status;
    if (query.category) filter.category = { $regex: query.category, $options: 'i' };
    if (query.search) {
      const rx = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ title: rx }, { excerpt: rx }, { tags: rx }, { author: rx }];
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [posts, total] = await Promise.all([
      this.blogModel
        .find(filter)
        .select('-content')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.blogModel.countDocuments(filter),
    ]);

    // Dashboard counts
    const [published, draft] = await Promise.all([
      this.blogModel.countDocuments({ status: BlogStatus.PUBLISHED }),
      this.blogModel.countDocuments({ status: BlogStatus.DRAFT }),
    ]);

    return {
      success: true,
      data: posts,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit), published, draft },
    };
  }

  async findOneAdmin(id: string) {
    const post = await this.blogModel.findById(id);
    if (!post) throw new NotFoundException('Blog post not found.');
    return { success: true, data: post };
  }

  async create(dto: CreateBlogDto) {
    const slug = dto.slug
      ? await this.ensureSlugUnique(dto.slug)
      : await this.generateUniqueSlug(dto.title);

    const sanitised = sanitizeHtml(dto.content ?? '', SANITIZE_OPTIONS);

    const post = new this.blogModel({
      ...dto,
      slug,
      content: sanitised,
      readTime: calcReadTime(sanitised),
      publishedAt: dto.status === BlogStatus.PUBLISHED ? new Date() : null,
    });

    await post.save();
    return { success: true, message: 'Post created.', data: post };
  }

  async update(id: string, dto: UpdateBlogDto) {
    const post = await this.blogModel.findById(id);
    if (!post) throw new NotFoundException('Blog post not found.');

    // If title changed and no explicit slug supplied, regenerate
    if (dto.title && !dto.slug && dto.title !== post.title) {
      post.slug = await this.generateUniqueSlug(dto.title, id);
    }
    if (dto.slug && dto.slug !== post.slug) {
      post.slug = await this.ensureSlugUnique(dto.slug, id);
    }

    if (dto.content !== undefined) {
      const clean = sanitizeHtml(dto.content, SANITIZE_OPTIONS);
      post.content = clean;
      post.readTime = calcReadTime(clean);
    }

    // Set publishedAt when first publishing
    if (dto.status === BlogStatus.PUBLISHED && post.status !== BlogStatus.PUBLISHED) {
      post.publishedAt = new Date();
    }

    const { content: _c, slug: _s, ...rest } = dto as any;
    Object.assign(post, rest);
    await post.save();
    return { success: true, message: 'Post updated.', data: post };
  }

  async remove(id: string) {
    const post = await this.blogModel.findById(id);
    if (!post) throw new NotFoundException('Blog post not found.');

    // Best-effort: delete cover image from storage
    if (post.coverImage) {
      try { await this.uploadService.deleteImage(post.coverImage); } catch {}
    }

    await post.deleteOne();
    return { success: true, message: 'Post deleted.' };
  }

  async uploadImage(file: Express.Multer.File): Promise<string> {
    const url = await this.uploadService.uploadImage(file, 'blog');
    return url;
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private async ensureSlugUnique(slug: string, excludeId?: string): Promise<string> {
    const exists = await this.blogModel.exists({
      slug,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    });
    if (exists) throw new ConflictException(`Slug "${slug}" is already taken.`);
    return slug;
  }
}
