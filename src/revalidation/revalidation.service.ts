import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ProductRevalidatePayload {
  action: 'create' | 'update' | 'delete' | 'archive' | 'restore';
  id: string;
  slug?: string;
  previousSlug?: string;
  categorySlug?: string;
}

export interface CategoryRevalidatePayload {
  action: 'create' | 'update' | 'delete';
  id: string;
  slug?: string;
  previousSlug?: string;
}

export interface SubCategoryRevalidatePayload {
  action: 'create' | 'update' | 'delete';
  id: string;
  slug?: string;
  previousSlug?: string;
  categorySlug?: string;
}

@Injectable()
export class RevalidationService {
  private readonly logger = new Logger(RevalidationService.name);

  constructor(private readonly configService: ConfigService) {}

  private getFrontendUrl(): string {
    const raw =
      this.configService.get<string>('FRONTEND_URL') ||
      process.env.FRONTEND_URL ||
      'http://localhost:3001';
    return raw.replace(/\/+$/, '');
  }

  private getSecret(): string | undefined {
    return (
      this.configService.get<string>('REVALIDATE_SECRET') ||
      process.env.REVALIDATE_SECRET
    );
  }

  /**
   * Notify frontend of a product mutation after MongoDB operation succeeds.
   */
  async revalidateProduct(payload: ProductRevalidatePayload): Promise<void> {
    const event = `product.${payload.action}`;
    this.notifyFrontend({
      event,
      model: 'product',
      ...payload,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Notify frontend of a category mutation after MongoDB operation succeeds.
   */
  async revalidateCategory(payload: CategoryRevalidatePayload): Promise<void> {
    const event = `category.${payload.action}`;
    this.notifyFrontend({
      event,
      model: 'category',
      ...payload,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Notify frontend of a subcategory mutation after MongoDB operation succeeds.
   */
  async revalidateSubCategory(payload: SubCategoryRevalidatePayload): Promise<void> {
    const event = `subcategory.${payload.action}`;
    this.notifyFrontend({
      event,
      model: 'subcategory',
      ...payload,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Safe server-to-server HTTP notification with retry & exponential backoff.
   * Runs non-blockingly and NEVER throws an exception that could fail the calling controller.
   */
  private notifyFrontend(body: Record<string, any>): void {
    const secret = this.getSecret();
    if (!secret) {
      this.logger.warn(
        '[Revalidation] REVALIDATE_SECRET is not configured on backend. Skipping frontend cache invalidation.',
      );
      return;
    }

    const frontendUrl = this.getFrontendUrl();
    const endpoint = `${frontendUrl}/api/revalidate`;

    // Fire non-blocking retry task
    this.sendWithRetry(endpoint, secret, body, 3).catch((err) => {
      this.logger.error(
        `[Revalidation] Unexpected error in background notification task: ${err.message}`,
      );
    });
  }

  private async sendWithRetry(
    endpoint: string,
    secret: string,
    body: Record<string, any>,
    maxRetries = 3,
  ): Promise<void> {
    const delays = [500, 1500, 3000];

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-revalidate-secret': secret,
            'User-Agent': 'FurniNest-Backend/1.0',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.ok) {
          const resData: any = await response.json().catch(() => ({}));
          this.logger.log(
            `[Revalidation] Cache revalidated for ${body.event} (${body.slug || body.id || 'catalog'}). Revalidated: ${JSON.stringify(resData.tags || [])}`,
          );
          return;
        }

        const status = response.status;
        const errText = await response.text().catch(() => '');
        this.logger.warn(
          `[Revalidation] Attempt ${attempt}/${maxRetries} failed with HTTP status ${status}: ${errText.slice(0, 120)}`,
        );
      } catch (error: any) {
        this.logger.warn(
          `[Revalidation] Attempt ${attempt}/${maxRetries} failed: ${error.message}`,
        );
      }

      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delays[attempt - 1]));
      }
    }

    this.logger.error(
      `[Revalidation] Exhausted all ${maxRetries} attempts notifying ${endpoint} for ${body.event}`,
    );
  }
}
