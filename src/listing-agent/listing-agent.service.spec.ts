import { Inject } from '@nestjs/common';

jest.mock('@nestjs/bullmq', () => ({
  InjectQueue: (name: string) => Inject(`BullQueue_${name}`),
  getQueueToken: (name: string) => `BullQueue_${name}`,
}));

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { OrchestratorService } from './orchestrator.service';
import { ListingDraft } from './schemas/listing-draft.schema';
import { Product } from '../product/schema/product.schema';
import { Category } from '../category/schema/category.schema';
import { SubCategory } from '../subcategory/schema/subcategory.schema';
import { UploadService } from '../upload/upload.service';
import { RevalidationService } from '../revalidation/revalidation.service';
import { VisionService } from './steps/vision.service';
import { SeoService } from './steps/seo.service';
import { VariantsService } from './steps/variants.service';
import { PricingService } from './steps/pricing.service';
import { ImageGenService } from './steps/image-gen.service';

const getQueueToken = (name: string) => `BullQueue_${name}`;

const mockDraftModel: any = {
  findById: jest.fn(),
  find: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  exec: jest.fn(),
  countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(0) }),
  create: jest.fn(),
};

const mockProductModel = {
  findById: jest.fn(),
  exists: jest.fn(),
  findOne: jest.fn(),
};

const mockQueue = {
  add: jest.fn().mockResolvedValue({ id: 'job-1' }),
};

const mockUploadService = {
  uploadImages: jest.fn().mockResolvedValue(['https://cdn.example.com/img1.jpg']),
};

const mockRevalidationService = {
  revalidateProduct: jest.fn(),
};

const mockVisionService = {
  analyze: jest.fn().mockResolvedValue({
    category: 'Sofa',
    material: 'Luxury Velvet',
    color: 'Charcoal Grey',
    style: 'Modern Luxury',
    seating: 3,
    features: ['Button tufting', 'Chrome legs', 'Flared arms'],
    specifications: [
      { label: 'Upholstery', value: 'Velvet' },
      { label: 'Frame', value: 'Hardwood' },
    ],
    confidence: 0.92,
    reviewRequired: false,
    raw: {},
  }),
};

const mockSeoService = {
  generate: jest.fn().mockResolvedValue({
    title: 'Charcoal Grey 3-Seater Velvet Sofa',
    slug: 'charcoal-grey-3-seater-velvet-sofa',
    metaDescription: 'A sleek charcoal grey 3-seater sofa in luxury velvet.',
    description: 'Elegant modern luxury sofa handcrafted for comfort.',
    tags: ['sofa', 'velvet', 'charcoal', 'luxury'],
  }),
};

const mockVariantsService = {
  generate: jest.fn().mockResolvedValue([
    {
      configName: '3-Seater',
      colorName: 'Charcoal Grey',
      colorHex: '#36454F',
      sku: 'LX-SOF-3-S-AB12',
      price: 649,
      compareAtPrice: 749,
      stock: 0,
      isActive: false,
    },
  ]),
};

const mockPricingService = {
  calculate: jest.fn().mockReturnValue({
    costPrice: 250,
    marginRate: 0.45,
    vatRate: 0.20,
    calculatedPrice: 439,
    compareAtPrice: 519,
    currency: 'GBP',
  }),
};

const mockImageGenService = {
  generateImages: jest.fn().mockResolvedValue([]),
};

describe('OrchestratorService — AI Listing Agent', () => {
  let service: OrchestratorService;

  beforeEach(async () => {
    function MockListingDraft(this: any, data: any) {
      Object.assign(this, data);
      this._id = 'draft-id-123';
      this.save = jest.fn().mockResolvedValue(this);
    }
    Object.assign(MockListingDraft, mockDraftModel);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrchestratorService,
        { provide: getModelToken(ListingDraft.name), useValue: MockListingDraft },
        { provide: getModelToken(Product.name), useValue: mockProductModel },
        { provide: getModelToken(Category.name), useValue: { findOne: jest.fn() } },
        { provide: getModelToken(SubCategory.name), useValue: { findOne: jest.fn() } },
        { provide: getQueueToken('listing-agent'), useValue: mockQueue },
        { provide: UploadService, useValue: mockUploadService },
        { provide: RevalidationService, useValue: mockRevalidationService },
        { provide: VisionService, useValue: mockVisionService },
        { provide: SeoService, useValue: mockSeoService },
        { provide: VariantsService, useValue: mockVariantsService },
        { provide: PricingService, useValue: mockPricingService },
        { provide: ImageGenService, useValue: mockImageGenService },
      ],
    }).compile();

    service = module.get<OrchestratorService>(OrchestratorService);
  });

  describe('createDraft validation', () => {
    it('throws BadRequestException when neither files nor rawDetails are provided', async () => {
      await expect(
        service.createDraft({ costPrice: 45000 } as any, []),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when more than 6 files are provided', async () => {
      const files = Array(7).fill({
        buffer: Buffer.from(''),
        mimetype: 'image/jpeg',
        originalname: 'test.jpg',
      });
      await expect(
        service.createDraft({ costPrice: 45000 } as any, files as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('successfully creates draft and enqueues job when files are provided', async () => {
      const files = [
        {
          buffer: Buffer.from('image-content'),
          mimetype: 'image/jpeg',
          originalname: 'sofa.jpg',
        },
      ];
      const result = await service.createDraft(
        { costPrice: 45000, language: 'en' } as any,
        files as any,
      );

      expect(result).toHaveProperty('draftId');
      expect(mockQueue.add).toHaveBeenCalledWith(
        'process-draft',
        expect.objectContaining({ draftId: expect.any(String) }),
        expect.any(Object),
      );
    });
  });

  describe('getDraftById', () => {
    it('throws NotFoundException when draft not found by id', async () => {
      mockDraftModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      await expect(service.getDraftById('000000000000000000000001')).rejects.toThrow();
    });
  });
});
