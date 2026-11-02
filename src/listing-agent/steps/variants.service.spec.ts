import { ConfigService } from '@nestjs/config';
import {
  VariantsService,
  isConfigMatchingSeating,
  VariantSelectionSchema,
} from './variants.service';
import { VisionAnalysis } from './vision.service';
import { PricingResult, PricingService } from './pricing.service';

describe('VariantsService Unit Tests', () => {
  let service: VariantsService;
  let pricingService: PricingService;

  beforeEach(() => {
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'ANTHROPIC_API_KEY') return 'test-key';
        if (key === 'ANTHROPIC_MODEL') return 'claude-sonnet-5-5';
        return null;
      }),
    } as unknown as ConfigService;

    pricingService = new PricingService();
    service = new VariantsService(configService, pricingService);
  });

  describe('isConfigMatchingSeating', () => {
    it('correctly matches configurations to seating numbers', () => {
      expect(isConfigMatchingSeating('3-Seater', 3)).toBe(true);
      expect(isConfigMatchingSeating('2-Seater', 2)).toBe(true);
      expect(isConfigMatchingSeating('4-Seater Corner', 4)).toBe(true);
      expect(isConfigMatchingSeating('Single Armchair', 1)).toBe(true);
      expect(isConfigMatchingSeating('Table + 4 Chairs Set', 4)).toBe(true);
      expect(isConfigMatchingSeating('Table + 6 Chairs Set', 6)).toBe(true);
      expect(isConfigMatchingSeating('Table + 8 Chairs Set', 8)).toBe(true);
    });

    it('returns false for non-matching configurations', () => {
      expect(isConfigMatchingSeating('2-Seater', 3)).toBe(false);
      expect(isConfigMatchingSeating('L-Shape Left Facing', 3)).toBe(false);
      expect(isConfigMatchingSeating('Table Only (160cm)', 4)).toBe(false);
      expect(isConfigMatchingSeating('3-Seater', null)).toBe(false);
      expect(isConfigMatchingSeating('3-Seater', undefined)).toBe(false);
    });
  });

  describe('VariantSelectionSchema', () => {
    it('validates a valid array of variant selections', () => {
      const valid = [
        { configName: '3-Seater', colorName: 'Charcoal Grey' },
        { configName: '2-Seater', colorName: 'Cream' },
      ];
      expect(VariantSelectionSchema.parse(valid)).toEqual(valid);
    });

    it('rejects empty arrays or invalid objects', () => {
      expect(() => VariantSelectionSchema.parse([])).toThrow();
      expect(() =>
        VariantSelectionSchema.parse([{ configName: '' }]),
      ).toThrow();
    });
  });

  describe('generate - variant properties, pricing, and photo assignment', () => {
    const sampleAnalysis: VisionAnalysis = {
      category: 'Sofa',
      material: 'Luxury Velvet',
      color: 'Charcoal Grey',
      style: 'Modern Luxury',
      seating: 3, // Detected in photo!
      features: ['Deep button tufting', 'Gold brass legs'],
      confidence: 0.95,
    };

    const basePricing: PricingResult = {
      costPrice: 250,
      marginRate: 0.45,
      vatRate: 0.20,
      calculatedPrice: 439,
      compareAtPrice: 519,
      currency: 'GBP',
    };

    const sampleImages = ['https://example.com/sofa-front.jpg', 'https://example.com/sofa-side.jpg'];

    it('assigns source photos ONLY to config matching detected seating (3-Seater) and needsPhoto: true to others', async () => {
      // Mock callClaude to return 3 variants: 3-Seater, 2-Seater, and L-Shape
      jest.spyOn<any, any>(service, 'callClaude').mockResolvedValue(
        JSON.stringify([
          { configName: '3-Seater', colorName: 'Charcoal Grey' },
          { configName: '2-Seater', colorName: 'Cream' },
          { configName: 'L-Shape Left Facing', colorName: 'Charcoal Grey' },
        ]),
      );

      const variants = await service.generate(sampleAnalysis, basePricing, sampleImages);

      expect(variants).toHaveLength(3);

      // 1. Detected seating variant (3-Seater):
      const v3 = variants.find((v) => v.configName === '3-Seater')!;
      expect(v3).toBeDefined();
      expect(v3.images).toEqual(sampleImages);
      expect(v3.needsPhoto).toBe(false);
      expect(v3.suggested).toBe(true);
      expect(v3.price).toBe(439); // multiplier 1.0
      expect(v3.stock).toBe(0);
      expect(v3.isActive).toBe(false);

      // 2. Non-photographed config (2-Seater):
      const v2 = variants.find((v) => v.configName === '2-Seater')!;
      expect(v2).toBeDefined();
      expect(v2.images).toEqual([]);
      expect(v2.needsPhoto).toBe(true);
      expect(v2.suggested).toBe(true);
      // multiplier 0.8: 439 * 0.8 = 351.2 -> 349
      expect(v2.price).toBe(349);
      expect(v2.price.toString().endsWith('9')).toBe(true);
      expect(v2.compareAtPrice!.toString().endsWith('9')).toBe(true);

      // 3. Non-photographed config (L-Shape):
      const vL = variants.find((v) => v.configName === 'L-Shape Left Facing')!;
      expect(vL).toBeDefined();
      expect(vL.images).toEqual([]);
      expect(vL.needsPhoto).toBe(true);
      expect(vL.suggested).toBe(true);
      // multiplier 1.5: 439 * 1.5 = 658.5 -> 659
      expect(vL.price).toBe(659);
      expect(vL.price.toString().endsWith('9')).toBe(true);
      expect(vL.compareAtPrice!.toString().endsWith('9')).toBe(true);
    });

    it('assigns photos to first variant when seating is null (e.g. Dining Table) and needsPhoto: true to others', async () => {
      const diningAnalysis: VisionAnalysis = {
        category: 'Dining Table',
        material: 'Solid Oak',
        color: 'Warm Brown',
        style: 'Scandinavian',
        seating: null,
        features: ['Beveled edge', 'Tapered legs'],
        confidence: 0.9,
      };

      const diningPricing: PricingResult = {
        costPrice: 300,
        marginRate: 0.35,
        vatRate: 0.20,
        calculatedPrice: 489,
        compareAtPrice: 579,
        currency: 'GBP',
      };

      const tableImages = ['https://example.com/table.jpg'];

      jest.spyOn<any, any>(service, 'callClaude').mockResolvedValue(
        JSON.stringify([
          { configName: 'Table Only (160cm)', colorName: 'Warm Brown' },
          { configName: 'Table + 6 Chairs Set', colorName: 'Warm Brown' },
        ]),
      );

      const variants = await service.generate(diningAnalysis, diningPricing, tableImages);

      expect(variants).toHaveLength(2);

      // First variant (detected item in photo) gets images
      expect(variants[0].images).toEqual(tableImages);
      expect(variants[0].needsPhoto).toBe(false);
      expect(variants[0].suggested).toBe(true);

      // Second variant gets no images and needsPhoto: true
      expect(variants[1].images).toEqual([]);
      expect(variants[1].needsPhoto).toBe(true);
      expect(variants[1].suggested).toBe(true);
      // Multiplier for Table + 6 Chairs Set is 1.8
      expect(variants[1].price.toString().endsWith('9')).toBe(true);
    });
  });
});
