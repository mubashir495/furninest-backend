import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SubCategoryController } from './subcategory.controller';
import { SubCategoryService } from './subcategory.service';
import { SubCategory, SubCategorySchema } from './schema/subcategory.schema';
import { Category, CategorySchema } from '../category/schema/category.schema';
import { RevalidationModule } from '../revalidation/revalidation.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SubCategory.name, schema: SubCategorySchema },
      { name: Category.name, schema: CategorySchema },
    ]),
  ],
  controllers: [SubCategoryController],
  providers: [SubCategoryService],
  exports: [SubCategoryService],
})
export class SubCategoryModule {}