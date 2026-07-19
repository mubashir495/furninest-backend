import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ShippingAddress,
  ShippingAddressDocument,
} from './schema/shipping-address.schema';
import { CreateShippingAddressDto } from './dto/create-shipping-address.dto';
import { UpdateShippingAddressDto } from './dto/update-shipping-address.dto';

@Injectable()
export class ShippingAddressService {
  constructor(
    @InjectModel(ShippingAddress.name)
    private readonly shippingAddressModel: Model<ShippingAddressDocument>,
  ) {}

  private async unsetPreviousDefault(userId: string) {
    await this.shippingAddressModel.updateMany(
      { user: userId, isDefault: true },
      { $set: { isDefault: false } },
    );
  }

  async create(userId: string, dto: CreateShippingAddressDto) {
    const existingCount = await this.shippingAddressModel.countDocuments({
      user: userId,
    });

    // First address a user adds automatically becomes their default
    const shouldBeDefault = dto.isDefault || existingCount === 0;

    if (shouldBeDefault) {
      await this.unsetPreviousDefault(userId);
    }

console.log('Saving user:', userId);

const address = new this.shippingAddressModel({
  ...dto,
  user: new Types.ObjectId(userId),

});
console.log(address);
    await address.save();

    return {
      success: true,
      message: 'Shipping address added.',
      data: address,
    };
  }

  async findAll(userId: string) {
    const addresses = await this.shippingAddressModel
      .find({ user: userId })
      .sort({ isDefault: -1, created_date: -1 });

    return { success: true, data: addresses };
  }

  async findOne(userId: string, addressId: string) {
    const address = await this.shippingAddressModel.findById(addressId);

    if (!address) {
      throw new NotFoundException('Shipping address not found.');
    }

    if (address.user.toString() !== userId) {
      throw new ForbiddenException('You cannot access this address.');
    }

    return { success: true, data: address };
  }

  async update(userId: string, addressId: string, dto: UpdateShippingAddressDto) {
    const address = await this.shippingAddressModel.findById(addressId);

    if (!address) {
      throw new NotFoundException('Shipping address not found.');
    }

    if (address.user.toString() !== userId) {
      throw new ForbiddenException('You cannot update this address.');
    }

    if (dto.isDefault === true) {
      await this.unsetPreviousDefault(userId);
    }

    Object.assign(address, dto);
    await address.save();

    return {
      success: true,
      message: 'Shipping address updated.',
      data: address,
    };
  }

  async remove(userId: string, addressId: string) {
    const address = await this.shippingAddressModel.findById(addressId);

    if (!address) {
      throw new NotFoundException('Shipping address not found.');
    }

    if (address.user.toString() !== userId) {
      throw new ForbiddenException('You cannot delete this address.');
    }

    await address.deleteOne();

    // If the deleted address was the default, promote the next one automatically
    if (address.isDefault) {
      const nextAddress = await this.shippingAddressModel
        .findOne({ user: userId })
        .sort({ created_date: -1 });

      if (nextAddress) {
        nextAddress.isDefault = true;
        await nextAddress.save();
      }
    }

    return {
      success: true,
      message: 'Shipping address deleted.',
    };
  }

  async setDefault(userId: string, addressId: string) {
    const address = await this.shippingAddressModel.findById(addressId);

    if (!address) {
      throw new NotFoundException('Shipping address not found.');
    }

    if (address.user.toString() !== userId) {
      throw new ForbiddenException('You cannot modify this address.');
    }

    await this.unsetPreviousDefault(userId);

    address.isDefault = true;
    await address.save();

    return {
      success: true,
      message: 'Default shipping address updated.',
      data: address,
    };
  }

  
  async getOwnedAddress(userId: string, addressId: string) {
    const address = await this.shippingAddressModel.findById(addressId);

    if (!address) {
      throw new NotFoundException('Shipping address not found.');
    }

    if (address.user.toString() !== userId) {
      throw new ForbiddenException('You cannot use this address.');
    }

    return address;
  }
}