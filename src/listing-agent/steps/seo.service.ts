import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { randomBytes } from 'crypto';

import { VisionAnalysis } from './vision.service';
import { Product, ProductDocument } from '../../product/schema/product.schema';

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
];

export function getAnalysisCorpus(analysis: VisionAnalysis): string {
  const parts = [
    analysis.category || '',
    analysis.material || '',
    analysis.color || '',
    analysis.style || '',
    ...(analysis.features || []),
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
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in environment variables.');
    }
    return new GoogleGenAI({ apiKey });
  }

  private getModelName(): string {
    return this.configService.get<string>('GEMINI_MODEL') || 'gemini-2.5-flash';
  }

  /**
   * Generates SEO metadata (title <= 60 chars, slug, metaDescription <= 155 chars, description, tags).
   * Strictly uses only facts present in the vision analysis.
   * Disallows unsupported marketing buzzwords unless present in analysis.
   */
  async generate(analysis: VisionAnalysis): Promise<SeoResult> {
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
      },
      null,
      2,
    );

    const basePrompt = `
You are an expert e-commerce SEO copywriter for "Luxa Furniture".
Write search-engine-optimized product listing content based ONLY on the following verified product analysis:

${analysisJson}

CRITICAL RULES:
1. Use ONLY words and facts supported by analysis.features, analysis.material, analysis.color, and analysis.style.
2. STRICTLY FORBIDDEN: Do NOT use unsupported marketing buzzwords such as "handcrafted", "premium quality", "durable", "comfortable", "warranty", "guaranteed", "genuine", "imported", "solid wood" unless explicitly present in the analysis above.
3. DO NOT invent features, materials, dimensions, certifications, or warranty claims that are not in the analysis.
4. "title": Catchy luxury product title, MAXIMUM 60 characters.
5. "slug": Clean URL-friendly kebab-case slug based on the title (lowercase letters, numbers, hyphens only).
6. "metaDescription": Compelling meta description for Google search, MAXIMUM 155 characters.
7. "description": Rich, engaging 2-3 paragraph product description highlighting only the confirmed material, style, and visible features.
8. "tags": 4 to 8 relevant search keywords/tags.

Respond strictly in valid JSON matching this schema:
{
  "title": "string (<= 60 chars)",
  "slug": "string (kebab-case)",
  "metaDescription": "string (<= 155 chars)",
  "description": "string",
  "tags": ["tag1", "tag2"]
}
`;

    let rawOutput: RawSeoData;

    try {
      this.logger.log(`Calling Gemini SEO generator using model ${model}...`);
      const responseText = await this.callGemini(client, model, basePrompt);
      rawOutput = this.parseAndValidate(responseText);
    } catch (firstErr: any) {
      this.logger.warn(
        `SEO generation attempt 1 failed (${firstErr?.message}). Retrying once with strict length rules...`,
      );

      try {
        const retryPrompt = `${basePrompt}\n\nATTENTION: Ensure strictly valid JSON. Remember: "title" must be <= 60 characters, and "metaDescription" must be <= 155 characters.`;
        const retryResponse = await this.callGemini(client, model, retryPrompt);
        rawOutput = this.parseAndValidate(retryResponse);
      } catch (retryErr: any) {
        this.logger.error(`SEO generation retry failed: ${retryErr?.message}`);
        throw new Error(`SEO generation failed: ${retryErr?.message || retryErr}`);
      }
    }

    // Post-check: check for banned words not present in analysis
    const analysisCorpus = getAnalysisCorpus(analysis);
    let unsupportedWords = findUnsupportedWordsInSeo(rawOutput, analysisCorpus);

    if (unsupportedWords.length > 0) {
      this.logger.warn(
        `SEO output contains unsupported marketing words: [${unsupportedWords.join(', ')}]. Regenerating once...`,
      );

      try {
        const warningPrompt = `${basePrompt}\n\nATTENTION: Your previous output contained forbidden marketing claims not present in the visual analysis: ${unsupportedWords.join(', ')}.\nRegenerate strictly without using any of these words or any unsupported claims.`;
        const regenResponse = await this.callGemini(client, model, warningPrompt);
        const regenOutput = this.parseAndValidate(regenResponse);

        // Check if regenerated output still has banned words
        const remainingUnsupported = findUnsupportedWordsInSeo(regenOutput, analysisCorpus);
        if (remainingUnsupported.length > 0) {
          this.logger.warn(
            `Regenerated SEO output still had unsupported words: [${remainingUnsupported.join(', ')}]. Stripping them...`,
          );
          rawOutput = stripUnsupportedWordsFromSeo(regenOutput, remainingUnsupported);
        } else {
          rawOutput = regenOutput;
        }
      } catch (regenErr: any) {
        this.logger.warn(
          `Regeneration after banned words failed (${regenErr?.message}). Stripping detected banned words directly...`,
        );
        rawOutput = stripUnsupportedWordsFromSeo(rawOutput, unsupportedWords);
      }
    }

    // Enforce safe truncation if length limits were exceeded even after retry
    let safeTitle = this.safeTruncate(rawOutput.title, 60);
    if (!safeTitle) {
      safeTitle = `${analysis.color || ''} ${analysis.category || 'Luxury Furniture'}`.trim();
    }

    let safeMetaDescription = this.safeTruncate(rawOutput.metaDescription, 155);
    if (!safeMetaDescription) {
      safeMetaDescription = `Explore ${safeTitle} at Luxa Furniture. Featuring ${analysis.material || 'luxury finishes'}.`;
    }

    // Normalize slug and ensure uniqueness in Product database
    const rawSlug = this.slugify(rawOutput.slug || safeTitle);
    const uniqueSlug = await this.ensureUniqueSlug(rawSlug);

    this.logger.log(`Generated SEO content: title="${safeTitle}", slug="${uniqueSlug}"`);

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
    // Truncate at word boundary if possible
    const truncated = trimmed.slice(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.7) {
      return truncated.slice(0, lastSpace).trim();
    }
    return truncated.trim();
  }

  private slugify(input: string): string {
    return input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'luxury-furniture';
  }

  /**
   * Ensures the slug does not collide with an existing published product.
   * If collision occurs, appends a short hex suffix.
   */
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
