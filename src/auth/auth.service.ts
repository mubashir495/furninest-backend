import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

import { SignupDto } from './dto/signup.dto';
import { User, UserDocument, UserRole } from './schema/user.schema';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,

    private readonly jwtService: JwtService,
  ) {}

  async signup(dto: SignupDto) {
    // Password Match
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException(
        'Password and Confirm Password do not match.',
      );
    }

    // Existing User
    const existingUser = await this.userModel.findOne({
      email: dto.email.toLowerCase(),
    });

    if (existingUser) {
      throw new ConflictException('Email already registered.');
    }

    // Hash Password
    const hashedPassword = await bcrypt.hash(dto.password, 12);

    // Email Verification Token
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const verificationExpires = new Date(Date.now() + 15 * 60 * 1000);

    // Create User
    const user = await this.userModel.create({
      fullName: dto.fullName,
      email: dto.email.toLowerCase(),
      password: hashedPassword,

      role: UserRole.CUSTOMER,

      isActive: true,
      isEmailVerified: false,

      emailVerificationToken: verificationToken,
      emailVerificationExpires: verificationExpires,
    });

    // TODO:
    // Send Email using Nodemailer
    // await this.mailService.sendVerificationEmail(user.email, verificationToken);

    return {
      success: true,
      message: 'Account created successfully. Please verify your email.',
      data: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
      },
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    // Find user with password
    const user = await this.userModel
      .findOne({
        email: email.toLowerCase(),
      })
      .select('+password +refreshToken');

    if (!user) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    // Check account status
    if (!user.isActive) {
      throw new UnauthorizedException('Your account has been disabled.');
    }

    // Check email verification
    if (!user.isEmailVerified) {
      throw new UnauthorizedException(
        'Please verify your email before logging in.',
      );
    }

    // Compare password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    // JWT Payload
    const payload = {
      sub: user._id,
      email: user.email,
      role: user.role,
    };

    // Generate Tokens
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: '15m',
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: '7d',
    });

    // Hash Refresh Token
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 12);

    // Save Refresh Token
    user.refreshToken = hashedRefreshToken;
    user.lastLogin = new Date();

    await user.save();

    return {
      success: true,
      message: 'Login successful.',
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    };
  }

  async profile(userId: string) {
  const user = await this.userModel
    .findById(userId)
    .select('-password -refreshToken');

  if (!user) {
    throw new NotFoundException('User not found.');
  }

  return {
    success: true,
    data: user,
  };
}

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    const { currentPassword, newPassword, confirmPassword } = changePasswordDto;

    // Find user with password
    const user = await this.userModel
      .findById(userId)
      .select('+password +refreshToken');

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    // Compare current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);

    if (!isMatch) {
      throw new UnauthorizedException('Current password is incorrect.');
    }

    // Check new password match
    if (newPassword !== confirmPassword) {
      throw new BadRequestException(
        'New password and confirm password do not match.',
      );
    }

    // Prevent same password
    const isSamePassword = await bcrypt.compare(newPassword, user.password);

    if (isSamePassword) {
      throw new BadRequestException(
        'New password must be different from current password.',
      );
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update user
    user.password = hashedPassword;

    user.refreshToken = null; // Logout all devices
    user.lastPasswordChanged = new Date();

    await user.save();

    return {
      success: true,
      message: 'Password changed successfully. Please login again.',
    };
  }
}
