import { PricingService, roundToUkRetailPrice } from './pricing.service';

describe('PricingService (UK Market)', () => {
  let service: PricingService;

  beforeEach(() => {
    service = new PricingService();
  });

  describe('roundToUkRetailPrice', () => {
    it('rounds UK furniture amounts to end in 9 or .99', () => {
      expect(roundToUkRetailPrice(650)).toBe(649);
      expect(roundToUkRetailPrice(250)).toBe(249);
      expect(roundToUkRetailPrice(50)).toBe(49);
      expect(roundToUkRetailPrice(1200)).toBe(1199);
      expect(roundToUkRetailPrice(14.5)).toBe(14.99);
      expect(roundToUkRetailPrice(0)).toBe(0);
    });

    it('always ends with 9 for amounts over £20', () => {
      const testValues = [25, 48, 150, 320, 650, 1250];
      for (const val of testValues) {
        const result = roundToUkRetailPrice(val);
        expect(result.toString().endsWith('9')).toBe(true);
      }
    });
  });

  describe('calculate (UK Pricing: Cost + Margin + 20% VAT)', () => {
    it('uses correct margin and adds 20% VAT for Sofa (margin: 45%)', () => {
      const cost = 250; // £250 cost
      const result = service.calculate(cost, 'Sofa');

      expect(result.marginRate).toBe(0.45);
      expect(result.vatRate).toBe(0.20);
      expect(result.currency).toBe('GBP');

      // Net = 250 * 1.45 = 362.5
      // Gross = 362.5 * 1.2 = 435 -> rounds to £439
      expect(result.calculatedPrice).toBe(439);
      expect(result.calculatedPrice.toString().endsWith('9')).toBe(true);
      expect(result.compareAtPrice).toBeGreaterThan(result.calculatedPrice);
      expect(result.compareAtPrice.toString().endsWith('9')).toBe(true);
    });

    it('falls back to default margin (40%) and adds 20% VAT for unknown category', () => {
      const cost = 200; // £200 cost
      const result = service.calculate(cost, 'Futuristic Floating Orb');

      expect(result.marginRate).toBe(0.4);
      expect(result.vatRate).toBe(0.20);
      // Net = 200 * 1.4 = 280
      // Gross = 280 * 1.2 = 336 -> rounds to £339
      expect(result.calculatedPrice).toBe(339);
      expect(result.calculatedPrice.toString().endsWith('9')).toBe(true);
    });

    it('calculates compareAtPrice (RRP) ~18% above calculatedPrice ending in 9', () => {
      const cost = 300;
      const result = service.calculate(cost, 'Dining Table');

      expect(result.compareAtPrice).toBeGreaterThan(result.calculatedPrice);
      expect(result.compareAtPrice.toString().endsWith('9')).toBe(true);

      const ratio = result.compareAtPrice / result.calculatedPrice;
      expect(ratio).toBeGreaterThan(1.05);
      expect(ratio).toBeLessThan(1.30);
    });
  });

  describe('calculateVariantPricing', () => {
    const basePrice = 649; // £649
    const baseCompareAt = 749; // £749

    it('calculates 3-Seater with 1.0 multiplier', () => {
      const variant = service.calculateVariantPricing(basePrice, baseCompareAt, '3-Seater');
      expect(variant.price).toBe(649);
      expect(variant.compareAtPrice).toBe(749);
    });

    it('calculates 2-Seater with 0.8 multiplier and ends in 9', () => {
      const variant = service.calculateVariantPricing(basePrice, baseCompareAt, '2-Seater');
      // 649 * 0.8 = 519.2 -> 519
      expect(variant.price).toBe(519);
      expect(variant.compareAtPrice).toBeGreaterThan(variant.price);
      expect(variant.compareAtPrice.toString().endsWith('9')).toBe(true);
    });

    it('calculates 4-Seater with 1.2 multiplier and ends in 9', () => {
      const variant = service.calculateVariantPricing(basePrice, baseCompareAt, '4-Seater Corner');
      // 649 * 1.2 = 778.8 -> 779
      expect(variant.price).toBe(779);
      expect(variant.compareAtPrice).toBeGreaterThan(variant.price);
    });

    it('calculates L-Shape with 1.5 multiplier and ends in 9', () => {
      const variant = service.calculateVariantPricing(basePrice, baseCompareAt, 'L-Shape Left Facing');
      // 649 * 1.5 = 973.5 -> 969 or 979
      expect(variant.price.toString().endsWith('9')).toBe(true);
      expect(variant.compareAtPrice.toString().endsWith('9')).toBe(true);
      expect(variant.compareAtPrice).toBeGreaterThan(variant.price);
    });
  });
});
