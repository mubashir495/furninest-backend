import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { randomBytes } from 'crypto';

import { VisionAnalysis } from './vision.service';
import { Product, ProductDocument } from '../../product/schema/product.schema';
import {
  SEO_SYSTEM_PROMPT,
  buildSeoUserPrompt,
} from '../config/prompts.config';

export const RawSeoSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  metaDescription: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string()).min(1),
});

export type RawSeoData = z.infer<typeof RawSeoSchema>;

export const BANNED_UNSUPPORTED_WORDS = [
  'handcrafted',
  'hand-crafted',
  'handmade',
  'hand-made',
  'warranty',
  'guaranteed',
  'guarantee',
  'genuine',
  'imported',
  'solid wood',
  'premium quality',
  'durable',
  'durability',
  'comfortable',
  'comfort',
  'lifelong',
  'certified',
  'eco-friendly',
  'fire compliant',
  'fire safety compliant',
  'crib 5',
  'bs 5852',
  'free delivery',
  'free uk delivery',
  'best in uk',
  'best in the uk',
];

export function getAnalysisCorpus(analysis: VisionAnalysis): string {
  const parts = [
    analysis.category || '',
    analysis.material || '',
    analysis.color || '',
    analysis.style || '',
    ...(analysis.features || []),
    ...(analysis.specifications?.map((s) => `${s.label} ${s.value}`) || []),
  ];
  return parts.join(' ').toLowerCase();
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function findUnsupportedBannedWords(
  text: string,
  analysisCorpus: string,
  bannedWords: string[] = BANNED_UNSUPPORTED_WORDS,
): string[] {
  const lowerText = (text || '').toLowerCase();
  const lowerCorpus = (analysisCorpus || '').toLowerCase();
  const found: string[] = [];

  for (const word of bannedWords) {
    const lowerWord = word.toLowerCase();
    const regex = new RegExp(`\\b${escapeRegExp(lowerWord)}\\b`, 'i');
    if (regex.test(lowerText)) {
      if (!regex.test(lowerCorpus)) {
        found.push(lowerWord);
      }
    }
  }

  return Array.from(new Set(found));
}

export function findUnsupportedWordsInSeo(
  seo: RawSeoData,
  analysisCorpus: string,
  bannedWords: string[] = BANNED_UNSUPPORTED_WORDS,
): string[] {
  const fullSeoText = [
    seo.title,
    seo.metaDescription,
    seo.description,
    ...(seo.tags || []),
  ].join(' ');
  return findUnsupportedBannedWords(fullSeoText, analysisCorpus, bannedWords);
}

export function stripUnsupportedBannedWords(
  text: string,
  unsupportedWords: string[],
): string {
  if (!text || unsupportedWords.length === 0) return text;
  let result = text;
  for (const word of unsupportedWords) {
    const regex = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'gi');
    result = result.replace(regex, '');
  }
  return result
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/([,.;!?])\s*([,.;!?])/g, '$1')
    .trim();
}

export function stripUnsupportedWordsFromSeo(
  seo: RawSeoData,
  unsupportedWords: string[],
): RawSeoData {
  return {
    title: stripUnsupportedBannedWords(seo.title, unsupportedWords),
    slug: seo.slug,
    metaDescription: stripUnsupportedBannedWords(seo.metaDescription, unsupportedWords),
    description: stripUnsupportedBannedWords(seo.description, unsupportedWords),
    tags: (seo.tags || [])
      .map((tag) => stripUnsupportedBannedWords(tag, unsupportedWords))
      .filter((tag) => tag.trim().length > 0),
  };
}

export interface SeoResult {
  title: string;
  slug: string;
  metaDescription: string;
  description: string;
  tags: string[];
}

@Injectable()
export class SeoService {
  private readonly logger = new Logger(SeoService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
  ) {}

  private getClient(): GoogleGenAI {
    const apiKey =
      this.configService.get<string>('GEMINI_API_KEY') ||
      this.configService.get<string>('GOOGLE_API_KEY') ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in environment variables.');
    }
    return new GoogleGenAI({ apiKey });
  }

  private getModelName(): string {
    return (
      this.configService.get<string>('GEMINI_MODEL') ||
      process.env.GEMINI_MODEL ||
      'gemini-2.5-flash'
    );
  }

  /**
   * Generates British English SEO metadata (title <= 60 chars, slug, metaDescription <= 155 chars, description, tags).
   * Complies with UK retail advertising guidelines and filters out unverified claims.
   */
  async generate(
    analysis: VisionAnalysis,
    rawDetails?: string,
  ): Promise<SeoResult> {
    const client = this.getClient();
    const model = this.getModelName();

    const analysisJson = JSON.stringify(
      {
        category: analysis.category,
        material: analysis.material,
        color: analysis.color,
        style: analysis.style,
        seating: analysis.seating,
        features: analysis.features,
        specifications: analysis.specifications,
      },
      null,
      2,
    );

    const basePrompt = buildSeoUserPrompt(analysisJson, rawDetails);

    let rawOutput: RawSeoData;

    // Attempt 1
    try {
      this.logger.log(`Calling Gemini (${model}) for British English SEO generation...`);
      const response = await this.callGemini(client, model, basePrompt);
      rawOutput = this.parseAndValidate(response);
    } catch (firstErr: any) {
      this.logger.warn(
        `Gemini SEO attempt 1 failed (${firstErr?.message}). Retrying once...`,
      );

      // Attempt 2 (Retry)
      try {
        const retryPrompt = `${basePrompt}\n\nATTENTION: Return strictly valid JSON adhering to the exact schema. Output must be British English. No markdown.`;
        const retryResponse = await this.callGemini(client, model, retryPrompt);
        rawOutput = this.parseAndValidate(retryResponse);
      } catch (retryErr: any) {
        this.logger.error(`Gemini SEO attempt 2 failed: ${retryErr?.message}`);
        throw new Error(`Gemini SEO generation failed: ${retryErr?.message || retryErr}`);
      }
    }

    // Post-check: check for ungrounded claims or forbidden marketing buzzwords
    const analysisCorpus = getAnalysisCorpus(analysis);
    const unsupportedWords = findUnsupportedWordsInSeo(rawOutput, analysisCorpus);

    if (unsupportedWords.length > 0) {
      this.logger.warn(
        `SEO output contains unsupported marketing claims: [${unsupportedWords.join(', ')}]. Stripping them...`,
      );
      rawOutput = stripUnsupportedWordsFromSeo(rawOutput, unsupportedWords);
    }

    // Enforce safe truncation for title and meta description
    let safeTitle = this.safeTruncate(rawOutput.title, 60);
    if (!safeTitle) {
      safeTitle = `${analysis.color || ''} ${analysis.category || 'Luxury Furniture'}`.trim();
    }

    let safeMetaDescription = this.safeTruncate(rawOutput.metaDescription, 155);
    if (!safeMetaDescription) {
      safeMetaDescription = `Discover the ${safeTitle} at Luxa Furniture UK. Beautiful ${analysis.material || 'luxury finishes'}.`;
    }

    // Normalize slug and ensure uniqueness in Product database
    const rawSlug = this.slugify(rawOutput.slug || safeTitle);
    const uniqueSlug = await this.ensureUniqueSlug(rawSlug);

    this.logger.log(`Generated UK SEO content: title="${safeTitle}", slug="${uniqueSlug}"`);

    return {
      title: safeTitle,
      slug: uniqueSlug,
      metaDescription: safeMetaDescription,
      description: rawOutput.description.trim(),
      tags: (rawOutput.tags || []).map((t) => t.trim().toLowerCase()).filter(Boolean),
    };
  }

  private async callGemini(
    client: GoogleGenAI,
    model: string,
    prompt: string,
  ): Promise<string> {
    const response = await client.models.generateContent({
      model,
      contents: [{ text: prompt }],
      config: {
        systemInstruction: SEO_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
      },
    });

    const text = response.text || '';
    if (!text.trim()) {
      throw new Error('Gemini returned empty text for SEO generation.');
    }
    return text;
  }

  private parseAndValidate(raw: string): RawSeoData {
    let cleaned = raw.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```/, '').replace(/```$/, '').trim();
    }

    const parsed = JSON.parse(cleaned);
    return RawSeoSchema.parse(parsed);
  }

  private safeTruncate(str: string, maxLength: number): string {
    const trimmed = (str || '').trim();
    if (trimmed.length <= maxLength) return trimmed;
    const truncated = trimmed.slice(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.7) {
      return truncated.slice(0, lastSpace).trim();
    }
    return truncated.trim();
  }

  private slugify(input: string): string {
    return (
      input
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'luxury-furniture'
    );
  }

  private async ensureUniqueSlug(baseSlug: string): Promise<string> {
    const exists = await this.productModel.exists({ slug: baseSlug });
    if (!exists) {
      return baseSlug;
    }

    const suffix = randomBytes(2).toString('hex');
    const newSlug = `${baseSlug}-${suffix}`;
    this.logger.warn(`Slug "${baseSlug}" already exists in products. Renamed to "${newSlug}".`);
    return newSlug;
  }
}
