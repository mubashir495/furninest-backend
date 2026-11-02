import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { OrchestratorService } from './orchestrator.service';

@Processor('listing-agent', { concurrency: 2 })
export class ListingAgentProcessor extends WorkerHost {
  private readonly logger = new Logger(ListingAgentProcessor.name);

  constructor(private readonly orchestrator: OrchestratorService) {
    super();
  }

  async process(job: Job<{ draftId: string }>): Promise<any> {
    const { draftId } = job.data;
    const attempt = job.attemptsMade + 1;
    this.logger.log(
      `Processing listing-agent job #${job.id} for draftId: ${draftId} (attempt ${attempt}/3)`,
    );

    try {
      const result = await this.orchestrator.processDraft(draftId);
      this.logger.log(`Job #${job.id} completed successfully for draftId: ${draftId}`);
      return result;
    } catch (err: any) {
      this.logger.error(
        `Job #${job.id} failed on attempt ${attempt} for draftId: ${draftId}. Error: ${err?.message}`,
      );
      throw err; // Rethrow to allow BullMQ to handle retries with backoff
    }
  }
}
