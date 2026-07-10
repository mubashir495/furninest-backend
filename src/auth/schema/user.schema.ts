import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

@Schema({
  timestamps: true,
  versionKey: false,
})
export class User {
  @Prop({
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 100,
  })
  fullName: string;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  })
  email: string;

  @Prop({
    required: true,
    select: false,
  })
  password: string;

  @Prop({
    type: String,
    enum: UserRole,
    default: UserRole.CUSTOMER,
  })
  role: UserRole;

  @Prop({
    default: true,
  })
  isActive: boolean;

  @Prop({
    default: false,
  })
  isEmailVerified: boolean;

 @Prop({
  type: String,
  default: null,
})
refreshToken: string | null;

  @Prop({
    type: String,
    default: null,
    select: false,
  })
  emailVerificationToken?: string;

  @Prop({
    type: Date,
    default: null,
  })
  emailVerificationExpires?: Date;

  @Prop({
    type: String,
    default: null,
    select: false,
  })
  passwordResetToken?: string;

  @Prop({
    type: Date,
    default: null,
  })
  passwordResetExpires?: Date;

  @Prop({
    type: Date,
    default: null,
  })
  lastLogin?: Date;

  @Prop({
    type: Date,
    default: null,
  })
  lastPasswordChanged?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
   