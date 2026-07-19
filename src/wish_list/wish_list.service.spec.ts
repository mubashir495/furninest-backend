import { Test, TestingModule } from '@nestjs/testing';
import { WishlistService } from './wish_list.service';
describe('WishListService', () => {
  let service: WishlistService ;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WishlistService ],
    }).compile();

    service = module.get<WishlistService >(WishlistService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
