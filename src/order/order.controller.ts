import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';

import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderStatus } from './schema/order.schema';

import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  // ---------- Customer Routes ----------

  @Post()
  checkout(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateOrderDto,
  ) {
    return this.orderService.createFromCart(userId, dto);
  }

  @Get('my-orders')
  findMyOrders(@CurrentUser('id') userId: string) {
    return this.orderService.findMyOrders(userId);
  }

  @Get(':id')
  findOne(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.orderService.findOne(userId, id);
  }

  @Patch(':id/cancel')
  cancelOrder(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.orderService.cancelOrder(userId, id);
  }

  // ---------- Admin Routes ----------

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Get()
  findAll(@Query('status') status?: OrderStatus) {
    return this.orderService.findAll(status);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.orderService.updateStatus(id, dto);
  }
}