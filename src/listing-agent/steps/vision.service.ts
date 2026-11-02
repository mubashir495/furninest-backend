import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';

export const VisionAnalysisSchema = z.object({
  category: z.string().min(1, 'Category is required'),
  material: z.string().min(1, 'Material is required'),
  color: z.string().min(1, 'Color is required'),
  style: z.string().min(1, 'Style is required'),
  seating: z.number().nullable(),
  features: z.array(z.string()).min(1, 'At least 1 feature is required'),
  confidence: z.number().min(0).max(1),
});

export type VisionAnalysis = z.infer<typeof VisionAnalysisSchema>;

export interface VisionResult extends VisionAnalysis {
  reviewRequired: boolean;
  raw: Record<string, any>;
}

@Injectable()
export class VisionService {
  private readonly logger = new Logger(VisionService.name);

  constructor(private readonly configService: ConfigService) {}

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
   * Fetches an image from a URL and converts it to base64 inlineData.
   * Never logs raw base64 data to console/logs.
   */
  private async fetchImageAsInlineData(
    url: string,
  ): Promise<{ mimeType: string; data: string }> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch image from URL: ${url} (status: ${response.status})`,
      );
    }
    const arrayBuffer = await response.arrayBuffer();
    const data = Buffer.from(arrayBuffer).toString('base64');

    let mimeType = response.headers.get('content-type') || 'image/jpeg';
    if (mimeType.includes(';')) {
      mimeType = mimeType.split(';')[0].trim();
    }
    if (
      !['image/jpeg', 'image/png', 'image/webp', 'image/jpg'].includes(mimeType)
    ) {
      const lower = url.toLowerCase();
      if (lower.endsWith('.png')) mimeType = 'image/png';
      else if (lower.endsWith('.webp')) mimeType = 'image/webp';
      else mimeType = 'image/jpeg';
    }

    return { mimeType, data };
  }

  /**
   * Analyzes 1-6 product photos using Gemini Vision.
   * Validates response with Zod and retries once on failure.
   */
  async analyze(imageUrls: string[]): Promise<VisionResult> {
    if (!imageUrls || imageUrls.length === 0) {
      throw new Error('No images provided for visual analysis.');
    }

    this.logger.log(`Fetching ${imageUrls.length} source images for Gemini Vision analysis...`);
    const imageParts = await Promise.all(
      imageUrls.slice(0, 6).map((url) => this.fetchImageAsInlineData(url)),
    );

    const client = this.getClient();
    const model = this.getModelName();

    const promptText = `
You are an expert furniture catalog analyst and appraiser.
Carefully examine the provided furniture photo(s) and extract accurate physical attributes.

Respond with strict JSON matching this schema:
{
  "category": "Furniture category (e.g. Sofa, Dining Table, Bed, Accent Chair, Coffee Table, Sideboard, Wardrobe)",
  "material": "Primary upholstery or construction material visible (e.g. Luxury Velvet, Boucle, Solid Oak, Marble Effect, Metal)",
  "color": "Dominant color of the item (e.g. Cream, Charcoal Grey, Navy Blue, Forest Green, Warm Brown)",
  "style": "Aesthetic style (e.g. Modern Luxury, Contemporary, Scandinavian, Chesterfield, Mid-Century)",
  "seating": <integer number of seats if it is a sofa, chair, or dining set, or null if not applicable>,
  "features": ["3 to 6 distinct physical features clearly visible in the photos"],
  "confidence": <decimal between 0.0 and 1.0 rating your confidence in this identification based on photo clarity>
}

CRITICAL RULES:
1. List in "features" ONLY what is clearly visible in the photos (e.g. silhouette/shape, tufting/stitching, leg style/finish, visible upholstery texture, armrest shape).
2. Do NOT infer internal construction (such as foam, inner frame, springs, webbing, internal joinery) or warranty, origin, or anything not directly visible.
3. If you cannot see it, do not list it.
4. NEVER guess dimensions or measurements. If uncertain, do NOT guess.
5. "seating" must be a number (e.g. 3) or null.
6. Only state facts clearly visible in the provided photo(s).
7. Output MUST be valid JSON only.
`;

    // Attempt 1
    try {
      this.logger.log(`Calling Gemini Vision model ${model}...`);
      const rawText = await this.callGemini(client, model, imageParts, promptText);
      const parsed = this.parseAndValidate(rawText);
      return this.formatResult(parsed);
    } catch (firstErr: any) {
      this.logger.warn(
        `Gemini Vision attempt 1 failed (${firstErr?.message}). Retrying once with strict reminder...`,
      );

      // Attempt 2 (Retry once)
      try {
        const retryPrompt = `${promptText}\n\nATTENTION: Your previous response was invalid. Ensure strictly valid JSON matching the exact schema with all fields. Remember: If you cannot see it, do not list it. Never infer internal construction.`;
        const retryRaw = await this.callGemini(client, model, imageParts, retryPrompt);
        const parsed = this.parseAndValidate(retryRaw);
        return this.formatResult(parsed);
      } catch (retryErr: any) {
        this.logger.error(
          `Gemini Vision attempt 2 (retry) also failed: ${retryErr?.message}`,
        );
        throw new Error(
          `Gemini Vision analysis failed after retry: ${retryErr?.message || retryErr}`,
        );
      }
    }
  }

  private async callGemini(
    client: GoogleGenAI,
    model: string,
    imageParts: { mimeType: string; data: string }[],
    prompt: string,
  ): Promise<string> {
    const response = await client.models.generateContent({
      model,
      contents: [
        ...imageParts.map((part) => ({
          inlineData: part,
        })),
        { text: prompt },
      ],
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text || '';
    if (!text.trim()) {
      throw new Error('Gemini returned an empty response.');
    }
    return text;
  }

  private parseAndValidate(rawJsonString: string): VisionAnalysis {
    let cleaned = rawJsonString.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```/, '').replace(/```$/, '').trim();
    }

    const obj = JSON.parse(cleaned);
    return VisionAnalysisSchema.parse(obj);
  }

  private formatResult(analysis: VisionAnalysis): VisionResult {
    // If confidence < 0.6 set reviewRequired = true
    const reviewRequired = analysis.confidence < 0.6;
    this.logger.log(
      `Vision analysis complete: category="${analysis.category}", confidence=${analysis.confidence}, reviewRequired=${reviewRequired}`,
    );

    return {
      ...analysis,
      reviewRequired,
      raw: { ...analysis },
    };
  }
}
