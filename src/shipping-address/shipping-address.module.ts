import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  ShippingAddress,
  ShippingAddressSchema,
} from './schema/shipping-address.schema';
import { ShippingAddressService } from './shipping-address.service';
import { ShippingAddressController } from './shipping-address.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ShippingAddress.name, schema: ShippingAddressSchema },
    ]),
  ],
  controllers: [ShippingAddressController],
  providers: [ShippingAddressService],
  exports: [ShippingAddressService],
})
export class ShippingAddressModule {}