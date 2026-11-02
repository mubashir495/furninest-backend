import { VisionAnalysisSchema } from './vision.service';

describe('VisionAnalysisSchema', () => {
  it('validates a correct vision analysis payload', () => {
    const validData = {
      category: 'Sofa',
      material: 'Luxury Velvet',
      color: 'Charcoal Grey',
      style: 'Modern Luxury',
      seating: 3,
      features: ['Deep button tufting', 'Gold brass legs', 'Fluted curved armrests'],
      confidence: 0.95,
    };

    const parsed = VisionAnalysisSchema.parse(validData);
    expect(parsed.category).toBe('Sofa');
    expect(parsed.confidence).toBe(0.95);
    expect(parsed.seating).toBe(3);
  });

  it('allows seating to be null for non-seating items', () => {
    const tableData = {
      category: 'Coffee Table',
      material: 'Sintered Stone',
      color: 'White',
      style: 'Contemporary',
      seating: null,
      features: ['Marble finish', 'Gold steel frame'],
      confidence: 0.88,
    };

    const parsed = VisionAnalysisSchema.parse(tableData);
    expect(parsed.seating).toBeNull();
  });

  it('rejects payload with confidence out of range', () => {
    const invalidData = {
      category: 'Bed',
      material: 'Boucle',
      color: 'Cream',
      style: 'Modern',
      seating: null,
      features: ['Wingback headboard'],
      confidence: 1.5, // invalid: max 1
    };

    expect(() => VisionAnalysisSchema.parse(invalidData)).toThrow();
  });
});
