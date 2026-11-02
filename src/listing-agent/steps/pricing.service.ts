import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getMultiplierForConfig } from '../config/allowed-variants.config';

export interface PricingResult {
  costPrice: number;
  marginRate: number;
  calculatedPrice: number;
  compareAtPrice: number;
}

const DEFAULT_CATEGORY_MARGINS: Record<string, number> = {
  sofa: 0.45,
  couch: 0.45,
  bed: 0.4,
  'dining table': 0.35,
  dining: 0.35,
  chair: 0.35,
  table: 0.35,
  wardrobe: 0.4,
  sideboard: 0.35,
  desk: 0.35,
};

const DEFAULT_MARGIN = 0.4;

/**
 * Rounds an amount so that it ends in 999 (e.g. 45,999, 9,999, 999).
 */
export function roundToEndIn999(amount: number): number {
  if (amount <= 999) return 999;
  const thousands = Math.round(amount / 1000);
  const rounded = thousands * 1000 - 1;
  return rounded < 999 ? 999 : rounded;
}

@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);

  constructor(private readonly configService?: ConfigService) {}

  /**
   * Pure code pricing engine (NO LLM).
   * price = cost * (1 + margin by category), rounded to end in 999.
   * compareAtPrice = price * ~1.15, also rounded to end in 999.
   */
  calculate(costPrice: number, category = ''): PricingResult {
    const validCost = Math.max(0, Number(costPrice) || 0);
    const marginRate = this.getMarginForCategory(category);

    const rawSellingPrice = validCost * (1 + marginRate);
    const calculatedPrice = roundToEndIn999(rawSellingPrice);

    // compareAtPrice is ~15% higher than calculatedPrice, ending in 999
    const rawCompareAt = calculatedPrice * 1.15;
    let compareAtPrice = roundToEndIn999(rawCompareAt);

    // Ensure compareAtPrice is strictly higher than calculatedPrice
    if (compareAtPrice <= calculatedPrice) {
      compareAtPrice = calculatedPrice + 1000;
    }

    this.logger.debug(
      `Pricing for cost ${validCost} (category: '${category}', margin: ${marginRate}): price=${calculatedPrice}, compareAt=${compareAtPrice}`,
    );

    return {
      costPrice: validCost,
      marginRate,
      calculatedPrice,
      compareAtPrice,
    };
  }

  /**
   * Calculates variant pricing applying the per-config price multiplier.
   * Both price and compareAtPrice are multiplied and rounded to end in 999.
   */
  calculateVariantPricing(
    basePrice: number,
    baseCompareAtPrice: number,
    configName: string,
  ): { price: number; compareAtPrice: number } {
    const multiplier = getMultiplierForConfig(configName);
    const rawVariantPrice = basePrice * multiplier;
    const price = roundToEndIn999(rawVariantPrice);

    const rawVariantCompareAt = (baseCompareAtPrice || basePrice * 1.15) * multiplier;
    let compareAtPrice = roundToEndIn999(rawVariantCompareAt);

    if (compareAtPrice <= price) {
      compareAtPrice = price + 1000;
    }

    return { price, compareAtPrice };
  }

  /**
   * Resolves the profit margin for a given category name (case-insensitive).
   * Falls back to configurable default for unknown categories.
   */
  getMarginForCategory(category: string): number {
    const clean = (category || '').toLowerCase().trim();

    // Check optional env overrides
    const envDefaultMargin = this.configService?.get<string>('PRICING_DEFAULT_MARGIN');
    const fallbackMargin = envDefaultMargin ? Number(envDefaultMargin) : DEFAULT_MARGIN;

    for (const [key, margin] of Object.entries(DEFAULT_CATEGORY_MARGINS)) {
      if (clean.includes(key)) {
        return margin;
      }
    }

    return fallbackMargin;
  }
}
