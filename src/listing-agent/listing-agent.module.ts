import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';

import {
  ListingDraft,
  ListingDraftSchema,
} from './schemas/listing-draft.schema';
import { Product, ProductSchema } from '../product/schema/product.schema';
import { Category, CategorySchema } from '../category/schema/category.schema';
import {
  SubCategory,
  SubCategorySchema,
} from '../subcategory/schema/subcategory.schema';

import { ListingAgentController } from './listing-agent.controller';
import { OrchestratorService } from './orchestrator.service';
import { ListingAgentProcessor } from './listing-agent.processor';
import { VisionService } from './steps/vision.service';
import { SeoService } from './steps/seo.service';
import { VariantsService } from './steps/variants.service';
import { PricingService } from './steps/pricing.service';
import { ImageGenService } from './steps/image-gen.service';

import { UploadModule } from '../upload/upload.module';
import { RevalidationModule } from '../revalidation/revalidation.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ListingDraft.name, schema: ListingDraftSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Category.name, schema: CategorySchema },
      { name: SubCategory.name, schema: SubCategorySchema },
    ]),
    BullModule.registerQueue({
      name: 'listing-agent',
    }),
    UploadModule,
    RevalidationModule,
  ],
  controllers: [ListingAgentController],
  providers: [
    OrchestratorService,
    ListingAgentProcessor,
    VisionService,
    SeoService,
    VariantsService,
    PricingService,
    ImageGenService,
  ],
  exports: [
    OrchestratorService,
    VisionService,
    SeoService,
    VariantsService,
    PricingService,
    ImageGenService,
  ],
})
export class ListingAgentModule {}
