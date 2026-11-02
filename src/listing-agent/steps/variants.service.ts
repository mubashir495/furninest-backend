import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
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
      this.logger.log(`Calling Claude (${model}) for variants selection...`);
      const raw = await this.callClaude(client, model, prompt);
      selections = this.parseAndValidate(raw);
    } catch (firstErr: any) {
      this.logger.warn(
        `Claude Variants attempt 1 failed (${firstErr?.message}). Retrying once with strict instructions...`,
      );

      try {
        const retryPrompt = `${prompt}\n\nATTENTION: Return strictly valid JSON array. No markdown code blocks.`;
        const retryRaw = await this.callClaude(client, model, retryPrompt);
        selections = this.parseAndValidate(retryRaw);
      } catch (retryErr: any) {
        this.logger.warn(
          `Claude Variants attempt 2 failed (${retryErr?.message}). Falling back to deterministic selections.`,
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

  private async callClaude(
    client: Anthropic,
    model: string,
    prompt: string,
  ): Promise<string> {
    const message = await client.messages.create({
      model,
      max_tokens: 512,
      system: VARIANTS_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    const text = textBlock && textBlock.type === 'text' ? textBlock.text : '';
    if (!text.trim()) {
      throw new Error('Claude returned empty text for Variants generation.');
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
      this.findClosestColorName(analysis.color, allowedColorNames) ||
      allowedColorNames[0];
    return [{ configName: matchingConfig, colorName: matchingColor }];
  }

  private sanitizeConfig(input: string, allowedConfigs: string[]): string {
    const clean = (input || '').trim();
    const exact = allowedConfigs.find((c) => c === clean);
    if (exact) return exact;
    const partial = allowedConfigs.find(
      (c) =>
        clean.toLowerCase().includes(c.toLowerCase()) ||
        c.toLowerCase().includes(clean.toLowerCase()),
    );
    return partial || allowedConfigs[0];
  }

  private sanitizeColor(input: string, allowedColorNames: string[]): string {
    const colorObj = this.findColorObject(input);
    return colorObj?.name || allowedColorNames[0];
  }

  private findClosestColorName(
    colorInput: string,
    allowedColorNames: string[],
  ): string | undefined {
    const colorObj = this.findColorObject(colorInput);
    return colorObj?.name;
  }

  private findColorObject(
    colorInput: string,
  ): (typeof ALLOWED_COLORS)[number] | undefined {
    const clean = (colorInput || '').toLowerCase().trim();
    const exact = ALLOWED_COLORS.find((c) => c.name.toLowerCase() === clean);
    if (exact) return exact;
    const partial = ALLOWED_COLORS.find(
      (c) =>
        clean.includes(c.name.toLowerCase()) ||
        c.name.toLowerCase().includes(clean),
    );
    return partial || ALLOWED_COLORS[0];
  }

  private sanitizeMaterial(materialInput: string): string {
    const clean = (materialInput || '').toLowerCase().trim();
    const matched = ALLOWED_MATERIALS.find(
      (m) =>
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
