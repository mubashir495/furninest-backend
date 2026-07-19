import {
  IsEnum,
  IsOptional,
  IsString,
  IsMongoId,
  ValidateNested,
  ValidateIf,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '../schema/order.schema';
import { ShippingAddressDto } from './shipping-address.dto';

export class CreateOrderDto {
  // Option A: reuse a previously saved address
  @ValidateIf((dto) => !dto.shippingAddress)
  @IsMongoId({ message: 'shippingAddressId must be a valid address id' })
  shippingAddressId?: string;

  // Option B: provide a brand-new address inline (it will be saved for future reuse)
  @ValidateIf((dto) => !dto.shippingAddressId)
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress?: ShippingAddressDto;

  @IsOptional()
  @IsEnum(PaymentMethod, { message: 'paymentMethod must be COD or CARD' })
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}