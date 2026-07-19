import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';

import { ShippingAddressService } from './shipping-address.service';
import { CreateShippingAddressDto } from './dto/create-shipping-address.dto';
import { UpdateShippingAddressDto } from './dto/update-shipping-address.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('shipping-addresses')
export class ShippingAddressController {
  constructor(private readonly shippingAddressService: ShippingAddressService) {}

 @Get()
findAll(@CurrentUser('id') userId: string) {
  console.log('Received userId:', userId);  // add this
  return this.shippingAddressService.findAll(userId);
}

  @Get(':id')
  findOne(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.shippingAddressService.findOne(userId, id);
  }

  @Post()
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateShippingAddressDto,
  ) {
    return this.shippingAddressService.create(userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateShippingAddressDto,
  ) {
    return this.shippingAddressService.update(userId, id, dto);
  }

  @Patch(':id/set-default')
  setDefault(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.shippingAddressService.setDefault(userId, id);
  }

  @Delete(':id')
  remove(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.shippingAddressService.remove(userId, id);
  }
}