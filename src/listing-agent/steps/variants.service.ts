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

export const VariantSelectionSchema = z.array(
  z.object({
    configName: z.string().min(1),
    colorName: z.string().min(1),
  }),
).min(1).max(6);

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

    const prompt = `
You are a luxury furniture inventory specialist.
A new furniture listing has been analyzed with the following attributes:
- Category: ${analysis.category}
- Detected Color: ${analysis.color}
- Detected Material: ${analysis.material}
- Seating: ${analysis.seating ?? 'N/A'}
- Style: ${analysis.style}

YOU MUST CHOOSE ONLY FROM THE STRICT ALLOWED LISTS BELOW:

ALLOWED COLORS:
${JSON.stringify(allowedColorNames)}

ALLOWED CONFIGURATIONS:
${JSON.stringify(allowedConfigs)}

RULES:
1. Select 1 to 4 logical variants for this product catalog entry.
2. "colorName" MUST be an exact match from the ALLOWED COLORS list above. NEVER invent a color.
3. "configName" MUST be an exact match from the ALLOWED CONFIGURATIONS list above. NEVER invent a configuration.
4. The first variant MUST represent the detected item: use the configuration matching the detected seating (${analysis.seating ?? 'N/A'}) and closest allowed color to "${analysis.color}".
5. Remaining variants should offer popular alternative sizes/configurations and colors from the allowed lists.

Respond strictly in JSON with an array of objects:
[
  {
    "configName": "Exact config name from allowed list",
    "colorName": "Exact color name from allowed list"
  }
]
`;

    let selections: VariantSelection;

    try {
      this.logger.log(`Calling Gemini Variants generator using model ${model}...`);
      const response = await this.callGemini(client, model, prompt);
      selections = this.parseAndValidate(response);
    } catch (firstErr: any) {
      this.logger.warn(
        `Variants generation attempt 1 failed (${firstErr?.message}). Retrying once...`,
      );

      try {
        const retryPrompt = `${prompt}\n\nATTENTION: Return ONLY a valid JSON array of objects using exact strings from the allowed lists.`;
        const retryResponse = await this.callGemini(client, model, retryPrompt);
        selections = this.parseAndValidate(retryResponse);
      } catch (retryErr: any) {
        this.logger.warn(
          `Variants generation retry failed (${retryErr?.message}). Falling back to safe default variant.`,
        );
        // Fallback safely to a default variant if LLM fails
        selections = [
          {
            configName: allowedConfigs[0] || 'Standard',
            colorName: this.matchClosestColor(analysis.color).name,
          },
        ];
      }
    }

    // Check if any selection matches the detected seating count
    const hasMatchingSeating =
      analysis.seating != null &&
      selections.some((item) => isConfigMatchingSeating(item.configName, analysis.seating));

    // Build complete DraftVariant documents
    const variants: DraftVariant[] = selections.map((item, index) => {
      const matchedColor = this.matchClosestColor(item.colorName);
      const configName = allowedConfigs.includes(item.configName)
        ? item.configName
        : allowedConfigs[0] || 'Standard';

      const sku = this.generateSku(analysis.category, configName, matchedColor.name, index);

      // Only the config detected in the photo (analysis.seating) gets the source photos
      // Other configs get images: [] and a flag needsPhoto: true
      const isDetectedPhotoConfig = hasMatchingSeating
        ? isConfigMatchingSeating(configName, analysis.seating)
        : index === 0;

      // Variants pricing applies per-config price multiplier, rounded to 999
      const variantPricing = this.pricingService.calculateVariantPricing(
        pricing.calculatedPrice,
        pricing.compareAtPrice,
        configName,
      );

      return {
        configName,
        colorName: matchedColor.name,
        colorHex: matchedColor.hex,
        sku,
        price: variantPricing.price,
        compareAtPrice: variantPricing.compareAtPrice,
        stock: 0, // default 0 per specification
        isActive: false, // false until admin sets stock per specification
        needsPhoto: !isDetectedPhotoConfig,
        suggested: true, // mark as AI-suggested
        dimensions: '', // never guess dimensions
        material: this.sanitizeMaterial(analysis.material),
        images: isDetectedPhotoConfig ? sourceImages : [],
      };
    });

    this.logger.log(`Generated ${variants.length} draft variants.`);
    return variants;
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
      throw new Error('Gemini returned empty text for variants.');
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
    const data = Array.isArray(parsed) ? parsed : (parsed.variants || [parsed]);
    return VariantSelectionSchema.parse(data);
  }

  private matchClosestColor(colorInput: string): { name: string; hex: string } {
    const clean = (colorInput || '').toLowerCase().trim();
    const exact = ALLOWED_COLORS.find(
      (c) => c.name.toLowerCase() === clean,
    );
    if (exact) return exact;

    const partial = ALLOWED_COLORS.find(
      (c) => clean.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(clean),
    );
    if (partial) return partial;

    // Default to first allowed color
    return ALLOWED_COLORS[0];
  }

  private sanitizeMaterial(materialInput: string): string {
    const clean = (materialInput || '').toLowerCase().trim();
    const matched = ALLOWED_MATERIALS.find((m) =>
      clean.includes(m.toLowerCase()) || m.toLowerCase().includes(clean),
    );
    return matched || 'Luxury Velvet';
  }

  private generateSku(
    category: string,
    config: string,
    color: string,
    index: number,
  ): string {
    const catCode = (category || 'FUR').replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase();
    const cfgCode = (config || 'STD').replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase();
    const colCode = (color || 'CLR').replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase();
    const rand = randomBytes(2).toString('hex').toUpperCase();
    return `LX-${catCode}-${cfgCode}-${colCode}-${rand}`;
  }
}
