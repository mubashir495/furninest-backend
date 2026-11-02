import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import {
  VISION_SYSTEM_PROMPT,
  buildVisionUserPrompt,
} from '../config/prompts.config';

export const VisionAnalysisSchema = z.object({
  category: z.string().min(1, 'Category is required'),
  material: z.string().min(1, 'Material is required'),
  color: z.string().min(1, 'Color is required'),
  style: z.string().min(1, 'Style is required'),
  seating: z.number().nullable().optional(),
  features: z.array(z.string()).min(1, 'At least 1 feature is required'),
  specifications: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
      }),
    )
    .optional(),
  confidence: z.number().min(0).max(1),
  suggestedPriceRange: z
    .object({
      min: z.number().min(0),
      max: z.number().min(0),
    })
    .optional(),
});

export type VisionAnalysis = z.infer<typeof VisionAnalysisSchema>;

export interface VisionResult extends VisionAnalysis {
  reviewRequired: boolean;
  raw: Record<string, any>;
}

// Max base64 bytes per image sent to Claude to avoid payload rejection (capped at ~1.5MB)
const MAX_IMAGE_BASE64_BYTES = 1_500_000;

@Injectable()
export class VisionService {
  private readonly logger = new Logger(VisionService.name);

  constructor(private readonly configService: ConfigService) {}

  private getClient(): Anthropic {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not defined in environment variables.');
    }
    return new Anthropic({ apiKey });
  }

  private getModelName(): string {
    return (
      this.configService.get<string>('ANTHROPIC_MODEL') ||
      'claude-sonnet-5-5'
    );
  }

  /**
   * Fetches an image from a URL, normalises its MIME type, and returns base64.
   */
  private async fetchImageAsInlineData(
    url: string,
  ): Promise<{ mediaType: Anthropic.Base64ImageSource['media_type']; data: string } | null> {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) {
        this.logger.warn(`Failed to fetch image: ${url} (status: ${response.status})`);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      let rawMime = response.headers.get('content-type') || 'image/jpeg';
      if (rawMime.includes(';')) rawMime = rawMime.split(';')[0].trim();

      const lower = url.toLowerCase();
      if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'].includes(rawMime)) {
        if (lower.endsWith('.png')) rawMime = 'image/png';
        else if (lower.endsWith('.webp')) rawMime = 'image/webp';
        else rawMime = 'image/jpeg';
      }

      const mediaType = (
        rawMime === 'image/jpg' ? 'image/jpeg' : rawMime
      ) as Anthropic.Base64ImageSource['media_type'];

      let data = buffer.toString('base64');

      // If image exceeds Claude's safe buffer, trim to valid base64 boundary
      if (data.length > MAX_IMAGE_BASE64_BYTES) {
        this.logger.warn(
          `Image ${url} base64 length ${data.length} exceeds limit. Trimming to ${MAX_IMAGE_BASE64_BYTES}.`,
        );
        const trimTo = MAX_IMAGE_BASE64_BYTES - (MAX_IMAGE_BASE64_BYTES % 4);
        data = data.slice(0, trimTo);
      }

      return { mediaType, data };
    } catch (err: any) {
      this.logger.warn(`Error downloading image ${url}: ${err?.message}`);
      return null;
    }
  }

  /**
   * Analyzes photos and/or raw text details using Claude Vision + Text.
   * Validates response with Zod and retries once on schema failure.
   */
  async analyze(imageUrls: string[] = [], rawDetails?: string): Promise<VisionResult> {
    if ((!imageUrls || imageUrls.length === 0) && (!rawDetails || !rawDetails.trim())) {
      throw new BadRequestException(
        'At least 1 product image or raw text details must be provided.',
      );
    }

    let imageParts: { mediaType: Anthropic.Base64ImageSource['media_type']; data: string }[] = [];

    if (imageUrls && imageUrls.length > 0) {
      this.logger.log(
        `Fetching up to ${Math.min(imageUrls.length, 6)} images for Claude Vision analysis...`,
      );
      const fetched = await Promise.all(
        imageUrls.slice(0, 6).map((url) => this.fetchImageAsInlineData(url)),
      );
      imageParts = fetched.filter((p): p is NonNullable<typeof p> => p !== null);
    }

    const client = this.getClient();
    const model = this.getModelName();
    const userPrompt = buildVisionUserPrompt(rawDetails);

    // Attempt 1
    try {
      this.logger.log(`Calling Claude (${model}) for visual & attribute analysis...`);
      const rawText = await this.callClaude(client, model, imageParts, userPrompt);
      const parsed = this.parseAndValidate(rawText);
      return this.formatResult(parsed);
    } catch (firstErr: any) {
      this.logger.warn(
        `Claude Vision attempt 1 failed (${firstErr?.message}). Retrying once with strict reminder...`,
      );

      // Attempt 2 (Retry)
      try {
        const retryPrompt = `${userPrompt}\n\nATTENTION: Your previous response was invalid. Return strictly valid JSON adhering to the exact schema. No markdown backticks.`;
        const retryRaw = await this.callClaude(client, model, imageParts, retryPrompt);
        const parsed = this.parseAndValidate(retryRaw);
        return this.formatResult(parsed);
      } catch (retryErr: any) {
        this.logger.error(
          `Claude Vision attempt 2 failed: ${retryErr?.message}`,
        );
        throw new Error(
          `Claude analysis failed: ${retryErr?.message || retryErr}`,
        );
      }
    }
  }

  private async callClaude(
    client: Anthropic,
    model: string,
    imageParts: { mediaType: Anthropic.Base64ImageSource['media_type']; data: string }[],
    prompt: string,
  ): Promise<string> {
    const contentBlocks: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] = [];

    for (const part of imageParts) {
      contentBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: part.mediaType,
          data: part.data,
        },
      });
    }

    contentBlocks.push({
      type: 'text',
      text: prompt,
    });

    const message = await client.messages.create({
      model,
      max_tokens: 1500,
      system: VISION_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: contentBlocks,
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    const text = textBlock && textBlock.type === 'text' ? textBlock.text : '';
    if (!text.trim()) {
      throw new Error('Claude returned an empty response.');
    }
    return text;
  }

  private parseAndValidate(rawJsonString: string): VisionAnalysis {
    let cleaned = rawJsonString.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```/, '').replace(/```$/, '').trim();
    }

    const obj = JSON.parse(cleaned);
    return VisionAnalysisSchema.parse(obj);
  }

  private formatResult(analysis: VisionAnalysis): VisionResult {
    const reviewRequired = analysis.confidence < 0.6;
    this.logger.log(
      `Analysis complete: category="${analysis.category}", confidence=${analysis.confidence}, reviewRequired=${reviewRequired}`,
    );

    return {
      ...analysis,
      reviewRequired,
      raw: { ...analysis },
    };
  }
}
