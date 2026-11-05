import * as dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { VisionService } from '../steps/vision.service';
import { PricingService } from '../steps/pricing.service';
import { SeoService } from '../steps/seo.service';
import { VariantsService } from '../steps/variants.service';
import { ListingDraftSchema, ListingDraftStatus } from '../schemas/listing-draft.schema';
import { ProductSchema } from '../../product/schema/product.schema';

const SOFA_IMAGE_URL =
  'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?q=80&w=1000&auto=format&fit=crop';
const DINING_TABLE_IMAGE_URL =
  'https://images.unsplash.com/photo-1617806118233-18e1de247200?q=80&w=1000&auto=format&fit=crop';

async function runRealE2ETest() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ ERROR: GEMINI_API_KEY is not defined in furninest_backend/.env.');
    console.error('Please set GEMINI_API_KEY=<your_api_key> in furninest_backend/.env and re-run.');
    process.exit(1);
  }

  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/furninest';
  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('✅ Connected to MongoDB.');

  const ListingDraftModel = mongoose.model('ListingDraft', ListingDraftSchema);
  const ProductModel = mongoose.model('Product', ProductSchema);

  const configService = new ConfigService({
    GEMINI_API_KEY: apiKey,
    GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  });

  const visionService = new VisionService(configService);
  const pricingService = new PricingService(configService);
  const seoService = new SeoService(configService, ProductModel as any);
  const variantsService = new VariantsService(configService, pricingService);

  console.log('\n==================================================');
  console.log('TEST 1: Real Sofa Photo Analysis & Draft Generation');
  console.log('==================================================');
  console.log(`Image URL: ${SOFA_IMAGE_URL}`);
  const sofaCostPrice = 45000;

  console.log('Step 1: Running VisionService.analyze()...');
  const sofaVision = await visionService.analyze([SOFA_IMAGE_URL]);
  console.log('Vision Analysis Result:', JSON.stringify(sofaVision, null, 2));

  console.log('Step 2: Running PricingService.calculate()...');
  const sofaPricing = pricingService.calculate(sofaCostPrice, sofaVision.category);
  console.log('Pricing Result:', JSON.stringify(sofaPricing, null, 2));

  console.log('Step 3: Running SeoService and VariantsService in parallel...');
  const [sofaSeo, sofaVariants] = await Promise.all([
    seoService.generate(sofaVision),
    variantsService.generate(sofaVision, sofaPricing, [SOFA_IMAGE_URL]),
  ]);

  console.log('Saving Sofa Draft to MongoDB...');
  const sofaDraftDoc = await ListingDraftModel.create({
    sourceImages: [SOFA_IMAGE_URL],
    costPrice: sofaCostPrice,
    status: ListingDraftStatus.PENDING_APPROVAL,
    analysis: sofaVision,
    pricing: sofaPricing,
    seo: sofaSeo,
    variants: sofaVariants,
    reviewRequired: sofaVision.reviewRequired,
  });

  const rawSofaDraft = await ListingDraftModel.findById(sofaDraftDoc._id).lean().exec();
  console.log('\n--- RAW STORED SOFA DRAFT JSON (MongoDB) ---');
  console.log(JSON.stringify(rawSofaDraft, null, 2));

  console.log('\n==========================================================');
  console.log('TEST 2: Real Dining Table Photo Analysis & Draft Generation');
  console.log('==========================================================');
  console.log(`Image URL: ${DINING_TABLE_IMAGE_URL}`);
  const diningCostPrice = 65000;

  console.log('Step 1: Running VisionService.analyze()...');
  const diningVision = await visionService.analyze([DINING_TABLE_IMAGE_URL]);
  console.log('Vision Analysis Result:', JSON.stringify(diningVision, null, 2));

  console.log('Step 2: Running PricingService.calculate()...');
  const diningPricing = pricingService.calculate(diningCostPrice, diningVision.category);
  console.log('Pricing Result:', JSON.stringify(diningPricing, null, 2));

  console.log('Step 3: Running SeoService and VariantsService in parallel...');
  const [diningSeo, diningVariants] = await Promise.all([
    seoService.generate(diningVision),
    variantsService.generate(diningVision, diningPricing, [DINING_TABLE_IMAGE_URL]),
  ]);

  console.log('Saving Dining Table Draft to MongoDB...');
  const diningDraftDoc = await ListingDraftModel.create({
    sourceImages: [DINING_TABLE_IMAGE_URL],
    costPrice: diningCostPrice,
    status: ListingDraftStatus.PENDING_APPROVAL,
    analysis: diningVision,
    pricing: diningPricing,
    seo: diningSeo,
    variants: diningVariants,
    reviewRequired: diningVision.reviewRequired,
  });

  const rawDiningDraft = await ListingDraftModel.findById(diningDraftDoc._id).lean().exec();
  console.log('\n--- RAW STORED DINING TABLE DRAFT JSON (MongoDB) ---');
  console.log(JSON.stringify(rawDiningDraft, null, 2));

  await mongoose.disconnect();
  console.log('\n✅ Real E2E Test Completed Successfully!');
}

runRealE2ETest().catch((err) => {
  console.error('Fatal error during E2E test:', err);
  process.exit(1);
});
