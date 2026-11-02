import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getMultiplierForConfig } from '../config/allowed-variants.config';

export interface PricingResult {
  costPrice: number;
  marginRate: number;
  vatRate: number;
  calculatedPrice: number;
  compareAtPrice: number;
  currency: string;
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
const DEFAULT_VAT_RATE = 0.20; // UK standard VAT (20%)
const DEFAULT_CURRENCY = 'GBP';

/**
 * Rounds a price to UK retail style (e.g. £49, £649, £1,199 or £14.99).
 * UK consumers expect clean retail price points ending in 9 (or .99 for small items).
 */
export function roundToUkRetailPrice(amount: number): number {
  if (amount <= 0) return 0;

  if (amount < 20) {
    // Under £20: round to .99 (e.g. £14.99)
    return Math.floor(amount) + 0.99;
  }

  // £20 and above: ends in 9 (e.g. £49, £149, £649, £1,199)
  const nearestTen = Math.round((amount - 9) / 10) * 10 + 9;
  return nearestTen < 19 ? 19 : nearestTen;
}

// Backward-compatibility alias
export const roundToEndIn999 = roundToUkRetailPrice;

@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);

  constructor(private readonly configService?: ConfigService) {}

  private getVatRate(): number {
    const fromEnv = this.configService?.get<string>('VAT_RATE');
    return fromEnv !== undefined && !isNaN(Number(fromEnv))
      ? Number(fromEnv)
      : DEFAULT_VAT_RATE;
  }

  private getCurrency(): string {
    return this.configService?.get<string>('CURRENCY') || DEFAULT_CURRENCY;
  }

  /**
   * UK retail pricing engine:
   * 1. Net price = cost * (1 + category margin)
   * 2. VAT-inclusive gross price = net * (1 + 20% VAT)
   * 3. Rounded to UK retail price point (e.g. £649, £1,199)
   * 4. compareAtPrice (RRP) ~15-20% higher, also ending in UK retail style
   */
  calculate(costPrice: number, category = ''): PricingResult {
    const validCost = Math.max(0, Number(costPrice) || 0);
    const marginRate = this.getMarginForCategory(category);
    const vatRate = this.getVatRate();
    const currency = this.getCurrency();

    // 1. Net price before VAT
    const netPrice = validCost * (1 + marginRate);

    // 2. VAT-inclusive consumer price (UK standard)
    const grossPrice = netPrice * (1 + vatRate);
    const calculatedPrice = roundToUkRetailPrice(grossPrice);

    // 3. Recommended Retail Price (compare-at price) ~18% higher
    const rawCompareAt = calculatedPrice * 1.18;
    let compareAtPrice = roundToUkRetailPrice(rawCompareAt);

    if (compareAtPrice <= calculatedPrice) {
      compareAtPrice = calculatedPrice + 50;
    }

    this.logger.debug(
      `UK Pricing for cost £${validCost} (${category}, margin: ${marginRate}, VAT: ${vatRate}): price=£${calculatedPrice}, compareAt=£${compareAtPrice}`,
    );

    return {
      costPrice: validCost,
      marginRate,
      vatRate,
      calculatedPrice,
      compareAtPrice,
      currency,
    };
  }

  /**
   * Calculates variant pricing applying the per-config price multiplier.
   * Both price and compareAtPrice are VAT-inclusive and rounded to UK retail style.
   */
  calculateVariantPricing(
    basePrice: number,
    baseCompareAtPrice: number,
    configName: string,
  ): { price: number; compareAtPrice: number } {
    const multiplier = getMultiplierForConfig(configName);
    const rawVariantPrice = basePrice * multiplier;
    const price = roundToUkRetailPrice(rawVariantPrice);

    const rawVariantCompareAt = (baseCompareAtPrice || basePrice * 1.18) * multiplier;
    let compareAtPrice = roundToUkRetailPrice(rawVariantCompareAt);

    if (compareAtPrice <= price) {
      compareAtPrice = price + (price >= 100 ? 50 : 10);
    }

    return { price, compareAtPrice };
  }

  /**
   * Resolves the profit margin for a given category name (case-insensitive).
   */
  getMarginForCategory(category: string): number {
    const clean = (category || '').toLowerCase().trim();

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
