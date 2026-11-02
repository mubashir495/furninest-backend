import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ImageGenService {
  private readonly logger = new Logger(ImageGenService.name);

  /**
   * Placeholder for Phase (d) image generation.
   */
  async generateImages(
    draftId: string,
    sourceImages: string[],
    prompt?: string,
  ): Promise<any[]> {
    this.logger.log(`Image generation requested for draft ${draftId} (Phase d stub).`);
    return [];
  }
}
