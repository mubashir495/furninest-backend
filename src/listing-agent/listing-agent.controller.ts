import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  HttpCode,
  HttpStatus,
  ValidationPipe,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';

import { OrchestratorService } from './orchestrator.service';
import { CreateListingDraftDto } from './dto/create-listing-draft.dto';
import { UpdateListingDraftDto } from './dto/update-listing-draft.dto';
import { QueryListingDraftDto } from './dto/query-listing-draft.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { multerOptions } from '../common/multer/multer.config';
import { ParseObjectIdPipe } from '../product/pipes/parse-object-id.pipe';

const queryPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: false,
});

@Controller('listing-agent')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class ListingAgentController {
  constructor(private readonly orchestrator: OrchestratorService) {}

  /**
   * Upload photos and/or raw details -> Creates draft, enqueues BullMQ job, returns draftId.
   */
  @Post('drafts')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseInterceptors(FilesInterceptor('images', 6, multerOptions))
  createDraft(
    @Body() dto: CreateListingDraftDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.orchestrator.createDraft(dto, files);
  }

  /**
   * Synchronous AI listing generation endpoint (POST /listing-agent/ai-generate or /listing-agent/generate).
   * Direct generation without waiting for background worker polling.
   */
  @Post('ai-generate')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseInterceptors(FilesInterceptor('images', 6, multerOptions))
  generateAiListing(
    @Body() dto: CreateListingDraftDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.orchestrator.generateDirect(dto, files);
  }

  @Post('generate')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseInterceptors(FilesInterceptor('images', 6, multerOptions))
  generateListingAlias(
    @Body() dto: CreateListingDraftDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.orchestrator.generateDirect(dto, files);
  }

  /**
   * List drafts with optional status filtering.
   */
  @Get('drafts')
  getDrafts(@Query(queryPipe) query: QueryListingDraftDto) {
    return this.orchestrator.getDrafts(query);
  }

  /**
   * Get draft by ID.
   */
  @Get('drafts/:id')
  getDraftById(@Param('id', ParseObjectIdPipe) id: string) {
    return this.orchestrator.getDraftById(id);
  }

  /**
   * Admin edits any field in a draft.
   */
  @Patch('drafts/:id')
  updateDraft(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateListingDraftDto,
  ) {
    return this.orchestrator.updateDraft(id, dto);
  }

  /**
   * Admin approves a draft.
   */
  @Post('drafts/:id/approve')
  @HttpCode(HttpStatus.OK)
  approveDraft(@Param('id', ParseObjectIdPipe) id: string) {
    return this.orchestrator.approveDraft(id);
  }

  /**
   * Publish creates the real Product (only if status === approved).
   */
  @Post('drafts/:id/publish')
  @HttpCode(HttpStatus.OK)
  publishDraft(@Param('id', ParseObjectIdPipe) id: string) {
    return this.orchestrator.publishDraft(id);
  }

  /**
   * Retry failed draft execution in BullMQ queue.
   */
  @Post('drafts/:id/retry')
  @HttpCode(HttpStatus.OK)
  retryDraft(@Param('id', ParseObjectIdPipe) id: string) {
    return this.orchestrator.retryDraft(id);
  }

  /**
   * Trigger AI image generation (optional step for Phase d).
   */
  @Post('drafts/:id/generate-images')
  @HttpCode(HttpStatus.OK)
  generateImages(@Param('id', ParseObjectIdPipe) id: string) {
    return this.orchestrator.generateImages(id);
  }
}
