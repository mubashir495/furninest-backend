import { Test, TestingModule } from '@nestjs/testing';
import { WishlistService } from './wish_list.service';
import { WishlistController } from './wish_list.controller';
describe('WishListController', () => {
  let controller: WishlistController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WishlistController],
      providers: [WishlistService],
    }).compile();

    controller = module.get<WishlistController>(WishlistController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
