import { VisionService, VisionAnalysisSchema } from './vision.service';
import { ConfigService } from '@nestjs/config';

describe('VisionService & VisionAnalysisSchema', () => {
  let service: VisionService;
  let configService: ConfigService;

  beforeEach(() => {
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'ANTHROPIC_API_KEY') return 'test-key';
        if (key === 'ANTHROPIC_MODEL') return 'claude-sonnet-5-5';
        return undefined;
      }),
    } as any;
    service = new VisionService(configService);
  });

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
        confidence: 1.5,
      };

      expect(() => VisionAnalysisSchema.parse(invalidData)).toThrow();
    });
  });

  describe('parseAndValidate (private via any)', () => {
    it('parses valid JSON string correctly', () => {
      const validJson = JSON.stringify({
        category: 'Sofa',
        material: 'Luxury Velvet',
        color: 'Charcoal Grey',
        style: 'Modern Luxury',
        seating: 3,
        features: ['Button tufting', 'Flared armrests', 'Chrome legs'],
        confidence: 0.9,
      });
      const result = (service as any).parseAndValidate(validJson);
      expect(result.category).toBe('Sofa');
      expect(result.seating).toBe(3);
      expect(result.confidence).toBe(0.9);
    });

    it('strips markdown fences before parsing', () => {
      const fenced =
        '```json\n{"category":"Bed","material":"Solid Oak","color":"Warm Brown","style":"Scandinavian","seating":null,"features":["Slatted headboard"],"confidence":0.85}\n```';
      const result = (service as any).parseAndValidate(fenced);
      expect(result.category).toBe('Bed');
    });

    it('throws on invalid JSON', () => {
      expect(() => (service as any).parseAndValidate('not json')).toThrow();
    });
  });

  describe('formatResult (private via any)', () => {
    it('sets reviewRequired=true when confidence < 0.6', () => {
      const analysis = {
        category: 'Sofa',
        material: 'Velvet',
        color: 'Cream',
        style: 'Modern',
        seating: 2,
        features: ['Feature1'],
        confidence: 0.55,
      };
      const result = (service as any).formatResult(analysis);
      expect(result.reviewRequired).toBe(true);
    });

    it('sets reviewRequired=false when confidence >= 0.6', () => {
      const analysis = {
        category: 'Chair',
        material: 'Boucle',
        color: 'Beige',
        style: 'Contemporary',
        seating: 1,
        features: ['Curved back'],
        confidence: 0.75,
      };
      const result = (service as any).formatResult(analysis);
      expect(result.reviewRequired).toBe(false);
    });
  });

  describe('getModelName', () => {
    it('falls back to claude-sonnet-5-5 when env not set', () => {
      const cs = { get: jest.fn().mockReturnValue(undefined) } as any;
      const s = new VisionService(cs);
      expect((s as any).getModelName()).toBe('claude-sonnet-5-5');
    });

    it('uses ANTHROPIC_MODEL from env when set', () => {
      const cs = { get: jest.fn().mockReturnValue('claude-3-7-sonnet-20250219') } as any;
      const s = new VisionService(cs);
      expect((s as any).getModelName()).toBe('claude-3-7-sonnet-20250219');
    });
  });
});
