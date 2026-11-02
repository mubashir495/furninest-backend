import { PricingService, roundToEndIn999 } from './pricing.service';

describe('PricingService', () => {
  let service: PricingService;

  beforeEach(() => {
    service = new PricingService();
  });

  describe('roundToEndIn999', () => {
    it('should round numbers to end in 999', () => {
      expect(roundToEndIn999(45920)).toBe(45999);
      expect(roundToEndIn999(45400)).toBe(44999);
      expect(roundToEndIn999(45600)).toBe(45999);
      expect(roundToEndIn999(1200)).toBe(999);
      expect(roundToEndIn999(1500)).toBe(1999);
      expect(roundToEndIn999(500)).toBe(999);
      expect(roundToEndIn999(0)).toBe(999);
    });

    it('always ends with 999 for any integer input', () => {
      const testValues = [1000, 2500, 15340, 32000, 78900, 125000];
      for (const val of testValues) {
        const result = roundToEndIn999(val);
        expect(result.toString().endsWith('999')).toBe(true);
      }
    });
  });

  describe('calculate', () => {
    it('uses the correct margin for a known category (Sofa: 45%)', () => {
      const cost = 30000;
      const result = service.calculate(cost, 'Sofa');
      expect(result.marginRate).toBe(0.45);
      // raw = 30000 * 1.45 = 43500 -> rounds to 43999
      expect(result.calculatedPrice).toBe(43999);
      expect(result.calculatedPrice.toString().endsWith('999')).toBe(true);
      expect(result.compareAtPrice).toBeGreaterThan(result.calculatedPrice);
      expect(result.compareAtPrice.toString().endsWith('999')).toBe(true);
    });

    it('falls back to default margin (40%) for an unknown category', () => {
      const cost = 30000;
      const result = service.calculate(cost, 'Futuristic Floating Orb');
      expect(result.marginRate).toBe(0.4);
      // raw = 30000 * 1.4 = 42000 -> rounds to 41999
      expect(result.calculatedPrice).toBe(41999);
      expect(result.calculatedPrice.toString().endsWith('999')).toBe(true);
    });

    it('calculates compareAtPrice about 15% above calculatedPrice ending in 999', () => {
      const cost = 32000;
      const result = service.calculate(cost, 'Dining Table');
      expect(result.marginRate).toBe(0.35);
      expect(result.compareAtPrice).toBeGreaterThan(result.calculatedPrice);
      expect(result.compareAtPrice.toString().endsWith('999')).toBe(true);

      const ratio = result.compareAtPrice / result.calculatedPrice;
      expect(ratio).toBeGreaterThan(1.05);
      expect(ratio).toBeLessThan(1.25);
    });
  });

  describe('calculateVariantPricing', () => {
    const basePrice = 49999;
    const baseCompareAt = 57999;

    it('calculates 3-Seater with 1.0 multiplier and ends in 999', () => {
      const variant = service.calculateVariantPricing(basePrice, baseCompareAt, '3-Seater');
      expect(variant.price).toBe(49999);
      expect(variant.price.toString().endsWith('999')).toBe(true);
      expect(variant.compareAtPrice).toBe(57999);
      expect(variant.compareAtPrice.toString().endsWith('999')).toBe(true);
    });

    it('calculates 2-Seater with 0.8 multiplier and ends in 999', () => {
      const variant = service.calculateVariantPricing(basePrice, baseCompareAt, '2-Seater');
      // 49999 * 0.8 = 39999.2 -> 39999
      expect(variant.price).toBe(39999);
      expect(variant.price.toString().endsWith('999')).toBe(true);
      // 57999 * 0.8 = 46399.2 -> 45999
      expect(variant.compareAtPrice.toString().endsWith('999')).toBe(true);
      expect(variant.compareAtPrice).toBeGreaterThan(variant.price);
    });

    it('calculates 4-Seater with 1.2 multiplier and ends in 999', () => {
      const variant = service.calculateVariantPricing(basePrice, baseCompareAt, '4-Seater Corner');
      // 49999 * 1.2 = 59998.8 -> 59999
      expect(variant.price).toBe(59999);
      expect(variant.price.toString().endsWith('999')).toBe(true);
      expect(variant.compareAtPrice.toString().endsWith('999')).toBe(true);
      expect(variant.compareAtPrice).toBeGreaterThan(variant.price);
    });

    it('calculates L-Shape with 1.5 multiplier and ends in 999', () => {
      const variant = service.calculateVariantPricing(basePrice, baseCompareAt, 'L-Shape Left Facing');
      // 49999 * 1.5 = 74998.5 -> 74999
      expect(variant.price).toBe(74999);
      expect(variant.price.toString().endsWith('999')).toBe(true);
      expect(variant.compareAtPrice.toString().endsWith('999')).toBe(true);
      expect(variant.compareAtPrice).toBeGreaterThan(variant.price);
    });

    it('falls back to 1.0 multiplier for an unmapped configuration', () => {
      const variant = service.calculateVariantPricing(basePrice, baseCompareAt, 'Custom Geometric Shape');
      expect(variant.price).toBe(basePrice);
      expect(variant.compareAtPrice).toBe(baseCompareAt);
    });
  });
});
