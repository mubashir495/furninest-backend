import {
  RawSeoSchema,
  findUnsupportedBannedWords,
  findUnsupportedWordsInSeo,
  stripUnsupportedBannedWords,
  stripUnsupportedWordsFromSeo,
  getAnalysisCorpus,
} from './seo.service';
import { VisionAnalysis } from './vision.service';

describe('SeoService Unit Tests', () => {
  describe('RawSeoSchema', () => {
    it('validates proper SEO data structure', () => {
      const validSeo = {
        title: 'Monaco Velvet 3-Seater Sofa',
        slug: 'monaco-velvet-3-seater-sofa',
        metaDescription: 'Shop the luxury Monaco 3-seater velvet sofa in charcoal grey. Handcrafted comfort with gold legs.',
        description: 'The Monaco 3-Seater Sofa combines sumptuous velvet upholstery with contemporary gold metal legs.',
        tags: ['sofa', 'velvet sofa', '3 seater', 'living room'],
      };

      const parsed = RawSeoSchema.parse(validSeo);
      expect(parsed.title).toBe(validSeo.title);
      expect(parsed.tags).toHaveLength(4);
    });

    it('rejects payload missing title or description', () => {
      const invalidSeo = {
        slug: 'incomplete-item',
        metaDescription: 'Short meta',
        tags: ['tag'],
      };

      expect(() => RawSeoSchema.parse(invalidSeo)).toThrow();
    });
  });

  describe('Unsupported Banned Words Detection & Stripping', () => {
    const sampleAnalysis: VisionAnalysis = {
      category: 'Sofa',
      material: 'Luxury Velvet',
      color: 'Charcoal Grey',
      style: 'Modern Luxury',
      seating: 3,
      features: ['Deep button tufting', 'Gold brass legs', 'Fluted curved arms'],
      confidence: 0.95,
    };

    it('detects banned words when not present in analysis corpus', () => {
      const corpus = getAnalysisCorpus(sampleAnalysis);
      const text = 'This handcrafted sofa offers a lifetime warranty and comfortable seating with solid wood.';
      const detected = findUnsupportedBannedWords(text, corpus);

      expect(detected).toContain('handcrafted');
      expect(detected).toContain('warranty');
      expect(detected).toContain('comfortable');
      expect(detected).toContain('solid wood');
    });

    it('allows terms if they are explicitly present in the visual analysis', () => {
      const analysisWithWood: VisionAnalysis = {
        ...sampleAnalysis,
        material: 'Solid Wood and Velvet',
        features: ['Comfortable deep seat cushions', 'Solid wood frame legs'],
      };
      const corpus = getAnalysisCorpus(analysisWithWood);

      const text = 'Solid wood sofa with comfortable cushions and genuine handcrafted warranty.';
      const detected = findUnsupportedBannedWords(text, corpus);

      // 'solid wood' and 'comfortable' are in the analysis corpus, so they are allowed!
      expect(detected).not.toContain('solid wood');
      expect(detected).not.toContain('comfortable');

      // 'genuine', 'handcrafted', 'warranty' are not in analysis corpus, so they are flagged
      expect(detected).toContain('genuine');
      expect(detected).toContain('handcrafted');
      expect(detected).toContain('warranty');
    });

    it('finds unsupported words across all SEO fields', () => {
      const corpus = getAnalysisCorpus(sampleAnalysis);
      const rawSeo = {
        title: 'Handcrafted Charcoal Grey Velvet Sofa',
        slug: 'charcoal-grey-velvet-sofa',
        metaDescription: 'Premium quality sofa with guaranteed durability and comfortable feel.',
        description: 'Featuring imported velvet with lifelong warranty.',
        tags: ['durable sofa', 'handcrafted', 'living room'],
      };

      const unsupported = findUnsupportedWordsInSeo(rawSeo, corpus);
      expect(unsupported).toContain('handcrafted');
      expect(unsupported).toContain('premium quality');
      expect(unsupported).toContain('guaranteed');
      expect(unsupported).toContain('durability');
      expect(unsupported).toContain('comfortable');
      expect(unsupported).toContain('imported');
      expect(unsupported).toContain('warranty');
    });

    it('strips unsupported banned words cleanly without leaving awkward artifacts', () => {
      const dirtyTitle = 'Handcrafted Charcoal Grey Velvet Sofa';
      const cleanTitle = stripUnsupportedBannedWords(dirtyTitle, ['handcrafted']);
      expect(cleanTitle).toBe('Charcoal Grey Velvet Sofa');

      const dirtyMeta = 'Premium quality sofa with guaranteed comfort and gold legs.';
      const cleanMeta = stripUnsupportedBannedWords(dirtyMeta, ['premium quality', 'guaranteed', 'comfort']);
      expect(cleanMeta).toBe('sofa with and gold legs.');
    });

    it('strips unsupported words from full SeoData payload', () => {
      const rawSeo = {
        title: 'Handcrafted Velvet 3-Seater Sofa',
        slug: 'velvet-3-seater-sofa',
        metaDescription: 'Premium quality sofa with guaranteed elegance.',
        description: 'Experience comfortable living room luxury with durable velvet.',
        tags: ['sofa', 'handcrafted', 'velvet'],
      };

      const cleaned = stripUnsupportedWordsFromSeo(rawSeo, [
        'handcrafted',
        'premium quality',
        'guaranteed',
        'comfortable',
        'durable',
      ]);

      expect(cleaned.title).toBe('Velvet 3-Seater Sofa');
      expect(cleaned.metaDescription).toBe('sofa with elegance.');
      expect(cleaned.description).not.toContain('comfortable');
      expect(cleaned.description).not.toContain('durable');
      expect(cleaned.tags).toEqual(['sofa', 'velvet']);
    });
  });
});
