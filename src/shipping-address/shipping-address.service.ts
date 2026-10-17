import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as mongoose from 'mongoose';
import { ShippingAddress, ShippingAddressDocument } from './schema/shipping-address.schema';
import { CreateShippingAddressDto } from './dto/create-shipping-address.dto';
import { UpdateShippingAddressDto } from './dto/update-shipping-address.dto';

@Injectable()
export class ShippingAddressService {
  constructor(
    @InjectModel(ShippingAddress.name)
    private shippingAddressModel: Model<ShippingAddressDocument>,
  ) {}

  async findAll(userId: string) {
    this.validateObjectId(userId);
    const objectId = new (mongoose as any).Types.ObjectId(userId);
    const data = await this.shippingAddressModel.find({ user: objectId }).exec();
    return { success: true, data };
  }

  async findOne(userId: string, id: string) {
    this.validateObjectId(userId);
    this.validateObjectId(id);
    const data = await this.shippingAddressModel.findOne({
      _id: new (mongoose as any).Types.ObjectId(id),
      user: new (mongoose as any).Types.ObjectId(userId),
    }).exec();
    if (!data) {
      throw new NotFoundException('Address not found');
    }
    return { success: true, data };
  }

  async create(userId: string, dto: CreateShippingAddressDto) {
    this.validateObjectId(userId);
    const objectId = new (mongoose as any).Types.ObjectId(userId);
    const newAddress = new this.shippingAddressModel({
      ...dto,
      user: objectId,
    });
    const data = await newAddress.save();
    return { success: true, data, message: 'Address created successfully' };
  }

  async update(userId: string, id: string, dto: UpdateShippingAddressDto) {
    this.validateObjectId(userId);
    this.validateObjectId(id);
    const data = await this.shippingAddressModel.findOneAndUpdate(
      { _id: new (mongoose as any).Types.ObjectId(id), user: new (mongoose as any).Types.ObjectId(userId) },
      dto,
      { new: true },
    ).exec();
    if (!data) {
      throw new NotFoundException('Address not found');
    }
    return { success: true, data, message: 'Address updated successfully' };
  }

  async setDefault(userId: string, id: string) {
    this.validateObjectId(userId);
    this.validateObjectId(id);

    await this.shippingAddressModel.updateMany(
      { user: new (mongoose as any).Types.ObjectId(userId) },
      { isDefault: false },
    ).exec();

    const data = await this.shippingAddressModel.findOneAndUpdate(
      { _id: new (mongoose as any).Types.ObjectId(id), user: new (mongoose as any).Types.ObjectId(userId) },
      { isDefault: true },
      { new: true },
    ).exec();
    if (!data) {
      throw new NotFoundException('Address not found');
    }
    return { success: true, data, message: 'Default address updated' };
  }

  async remove(userId: string, id: string) {
    this.validateObjectId(userId);
    this.validateObjectId(id);
    const result = await this.shippingAddressModel.findOneAndDelete({
      _id: new (mongoose as any).Types.ObjectId(id),
      user: new (mongoose as any).Types.ObjectId(userId),
    }).exec();
    if (!result) {
      throw new NotFoundException('Address not found');
    }
    return { success: true, message: 'Address deleted successfully' };
  }

  private validateObjectId(id: string) {
    if (!mongoose.isValidObjectId(id)) {
      throw new BadRequestException('Invalid ID format');
    }
  }
}