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
    default: null,
    select: false,
  })
  refreshToken: string | null;

  @Prop({
    default: null,
    select: false,
  })
  emailVerificationToken: string | null;

  @Prop({
    default: null,
  })
  emailVerificationExpires: Date | null;

  @Prop({
    default: null,
    select: false,
  })
  passwordResetToken: string | null;

  @Prop({
    default: null,
  })
  passwordResetExpires: Date | null;

  @Prop({
    default: null,
  })
  lastLogin: Date | null;

  @Prop({
    default: null,
  })
  lastPasswordChanged: Date | null;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Create unique index
UserSchema.index({ email: 1 }, { unique: true });