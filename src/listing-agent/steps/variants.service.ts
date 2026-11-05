import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { randomBytes } from 'crypto';

import { VisionAnalysis } from './vision.service';
import { PricingResult, PricingService } from './pricing.service';
import { DraftVariant } from '../schemas/listing-draft.schema';
import {
  ALLOWED_COLORS,
  ALLOWED_CONFIGS_BY_CATEGORY,
  ALLOWED_MATERIALS,
} from '../config/allowed-variants.config';
import {
  VARIANTS_SYSTEM_PROMPT,
  buildVariantsUserPrompt,
} from '../config/prompts.config';

export const VariantSelectionSchema = z
  .array(
    z.object({
      configName: z.string().min(1),
      colorName: z.string().min(1),
    }),
  )
  .min(1)
  .max(6);

export type VariantSelection = z.infer<typeof VariantSelectionSchema>;

/**
 * Checks if a configuration name matches the detected seating count.
 */
export function isConfigMatchingSeating(configName: string, seating?: number | null): boolean {
  if (seating === null || seating === undefined) {
    return false;
  }
  const clean = (configName || '').toLowerCase().trim();

  if (seating === 1) {
    return clean.includes('single') || clean.includes('1-seater') || clean.includes('1 chair');
  }
  if (seating === 2) {
    return (clean.includes('2-seater') || clean.includes('2 seater') || clean.includes('set of 2')) && !clean.includes('12');
  }
  if (seating === 3) {
    return clean.includes('3-seater') || clean.includes('3 seater');
  }
  if (seating === 4) {
    return clean.includes('4-seater') || clean.includes('4 seater') || clean.includes('set of 4') || clean.includes('4 chairs');
  }
  if (seating === 6) {
    return clean.includes('6-seater') || clean.includes('6 seater') || clean.includes('set of 6') || clean.includes('6 chairs');
  }
  if (seating === 8) {
    return clean.includes('8-seater') || clean.includes('8 seater') || clean.includes('set of 8') || clean.includes('8 chairs');
  }

  const regex = new RegExp(`\\b${seating}(-|\\s)?(seater|chairs|chair|person|pc|piece)?\\b`, 'i');
  return regex.test(clean);
}

@Injectable()
export class VariantsService {
  private readonly logger = new Logger(VariantsService.name);
  private readonly pricingService: PricingService;

  constructor(
    private readonly configService: ConfigService,
    @Optional() pricingService?: PricingService,
  ) {
    this.pricingService = pricingService || new PricingService(configService);
  }

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
      'gemini-3.8-flash'
    );
  }

  /**
   * Generates draft variants strictly selecting from configured allowed lists.
   * SKU auto-generated, price from pricing, stock default 0, isActive false.
   */
  async generate(
    analysis: VisionAnalysis,
    pricing: PricingResult,
    sourceImages: string[] = [],
  ): Promise<DraftVariant[]> {
    const client = this.getClient();
    const model = this.getModelName();

    const categoryKey = (analysis.category || '').toLowerCase();
    const allowedConfigs =
      Object.entries(ALLOWED_CONFIGS_BY_CATEGORY).find(([k]) =>
        categoryKey.includes(k),
      )?.[1] || ALLOWED_CONFIGS_BY_CATEGORY.default;

    const allowedColorNames = ALLOWED_COLORS.map((c) => c.name);

    const prompt = buildVariantsUserPrompt(
      analysis.category,
      analysis.color,
      analysis.material,
      analysis.seating,
      analysis.style,
      allowedColorNames,
      allowedConfigs,
    );

    let selections: VariantSelection;

    try {
      this.logger.log(`Calling Gemini (${model}) for variants selection...`);
      const raw = await this.callGemini(client, model, prompt);
      selections = this.parseAndValidate(raw);
    } catch (firstErr: any) {
      this.logger.warn(
        `Gemini Variants attempt 1 failed (${firstErr?.message}). Retrying once with strict instructions...`,
      );

      try {
        const retryPrompt = `${prompt}\n\nATTENTION: Return strictly valid JSON array. No markdown code blocks.`;
        const retryRaw = await this.callGemini(client, model, retryPrompt);
        selections = this.parseAndValidate(retryRaw);
      } catch (retryErr: any) {
        this.logger.warn(
          `Gemini Variants attempt 2 failed (${retryErr?.message}). Falling back to deterministic selections.`,
        );
        selections = this.buildFallbackSelections(
          analysis,
          allowedConfigs,
          allowedColorNames,
        );
      }
    }

    // Sanitize selections against allowed lists
    const sanitized = selections.map((s) => ({
      configName: this.sanitizeConfig(s.configName, allowedConfigs),
      colorName: this.sanitizeColor(s.colorName, allowedColorNames),
    }));

    // Build full DraftVariant objects
    return sanitized.map((s, idx) => {
      const color =
        ALLOWED_COLORS.find((c) => c.name === s.colorName) || ALLOWED_COLORS[0];
      const variantPricing = this.pricingService.calculateVariantPricing(
        pricing.calculatedPrice,
        pricing.compareAtPrice,
        s.configName,
      );

      return {
        configName: s.configName,
        colorName: color.name,
        colorHex: color.hex,
        sku: this.generateSku(analysis.category, s.configName, color.name, idx),
        price: variantPricing.price,
        compareAtPrice: variantPricing.compareAtPrice,
        stock: 0,
        dimensions: '',
        material: this.sanitizeMaterial(analysis.material),
        images: idx === 0 ? sourceImages : [],
        needsPhoto: idx !== 0,
        suggested: true,
        isActive: false,
      } as unknown as DraftVariant;
    });
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
        systemInstruction: VARIANTS_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
      },
    });

    const text = response.text || '';
    if (!text.trim()) {
      throw new Error('Gemini returned empty text for Variants generation.');
    }
    return text;
  }

  private parseAndValidate(raw: string): VariantSelection {
    let cleaned = raw.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```/, '').replace(/```$/, '').trim();
    }
    const parsed = JSON.parse(cleaned);
    return VariantSelectionSchema.parse(parsed);
  }

  private buildFallbackSelections(
    analysis: VisionAnalysis,
    allowedConfigs: string[],
    allowedColorNames: string[],
  ): VariantSelection {
    const matchingConfig =
      allowedConfigs.find((c) => isConfigMatchingSeating(c, analysis.seating)) ||
      allowedConfigs[0];

    const matchingColor =
      allowedColorNames.find(
        (c) =>
          c.toLowerCase() === (analysis.color || '').toLowerCase() ||
          (analysis.color || '').toLowerCase().includes(c.toLowerCase()),
      ) || allowedColorNames[0];

    const altColor =
      allowedColorNames.find((c) => c !== matchingColor) || matchingColor;

    return [
      { configName: matchingConfig, colorName: matchingColor },
      { configName: matchingConfig, colorName: altColor },
    ];
  }

  private sanitizeConfig(config: string, allowedConfigs: string[]): string {
    const exact = allowedConfigs.find(
      (c) => c.toLowerCase() === (config || '').toLowerCase(),
    );
    if (exact) return exact;

    const partial = allowedConfigs.find(
      (c) =>
        c.toLowerCase().includes((config || '').toLowerCase()) ||
        (config || '').toLowerCase().includes(c.toLowerCase()),
    );
    if (partial) return partial;

    return allowedConfigs[0];
  }

  private sanitizeColor(color: string, allowedColors: string[]): string {
    const exact = allowedColors.find(
      (c) => c.toLowerCase() === (color || '').toLowerCase(),
    );
    if (exact) return exact;

    const partial = allowedColors.find(
      (c) =>
        c.toLowerCase().includes((color || '').toLowerCase()) ||
        (color || '').toLowerCase().includes(c.toLowerCase()),
    );
    if (partial) return partial;

    return allowedColors[0];
  }

  private sanitizeMaterial(material: string): string {
    const exact = ALLOWED_MATERIALS.find(
      (m) => m.toLowerCase() === (material || '').toLowerCase(),
    );
    if (exact) return exact;

    const partial = ALLOWED_MATERIALS.find(
      (m) =>
        m.toLowerCase().includes((material || '').toLowerCase()) ||
        (material || '').toLowerCase().includes(m.toLowerCase()),
    );
    if (partial) return partial;

    return ALLOWED_MATERIALS[0];
  }

  private generateSku(
    category: string,
    config: string,
    color: string,
    idx: number,
  ): string {
    const catCode = (category || 'LUX')
      .replace(/[^A-Za-z]/g, '')
      .slice(0, 3)
      .toUpperCase();

    const configCode = (config || 'STD')
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 3)
      .toUpperCase();

    const colorCode = (color || 'CLR')
      .replace(/[^A-Za-z]/g, '')
      .slice(0, 3)
      .toUpperCase();

    const rand = randomBytes(2).toString('hex').toUpperCase();
    return `${catCode}-${configCode}-${colorCode}-${idx + 1}-${rand}`;
  }
}
