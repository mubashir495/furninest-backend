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
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { MailService } from '../mail/mail.service';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

 private async issueTokens(user: UserDocument) {
  const payload = { sub: user._id, email: user.email, role: user.role };

  const accessToken = await this.jwtService.signAsync(payload, {
    secret: process.env.JWT_ACCESS_SECRET,
    expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN ?? '15m') as any,
  });

  const refreshToken = await this.jwtService.signAsync(payload, {
    secret: process.env.JWT_REFRESH_SECRET,
    expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN ?? '7d') as any,
  });

  user.refreshToken = await bcrypt.hash(refreshToken, 12);
  await user.save();

  return { accessToken, refreshToken };
}

  private async issueVerificationToken(user: UserDocument) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    user.emailVerificationToken = hashToken(rawToken);
    user.emailVerificationExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();
    return rawToken;
  }

  async signup(dto: SignupDto) {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException(
        'Password and Confirm Password do not match.',
      );
    }

    const existingUser = await this.userModel.findOne({
      email: dto.email.toLowerCase(),
    });

    if (existingUser) {
      throw new ConflictException('Email already registered.');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const user = await this.userModel.create({
      fullName: dto.fullName,
      email: dto.email.toLowerCase(),
      password: hashedPassword,
      role: UserRole.CUSTOMER,
      isActive: true,
      isEmailVerified: false,
    });

    const rawToken = await this.issueVerificationToken(user);
    await this.mailService.sendVerificationEmail(user.email, user.fullName, rawToken);

    return {
      success: true,
      message: 'Account created successfully. Please check your email to verify your account.',
      data: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
      },
    };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const tokenHash = hashToken(dto.token);

    const user = await this.userModel.findOne({
      emailVerificationToken: tokenHash,
      emailVerificationExpires: { $gt: new Date() },
    });

    if (!user) {
      throw new BadRequestException('Verification link is invalid or has expired.');
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    return {
      success: true,
      message: 'Email verified successfully. You can now log in.',
    };
  }

  async resendVerification(dto: ResendVerificationDto) {
    const user = await this.userModel.findOne({ email: dto.email.toLowerCase() });

    // Don't reveal whether the email exists in our system
    const genericResponse = {
      success: true,
      message: 'If an account exists and is unverified, a new verification email has been sent.',
    };

    if (!user || user.isEmailVerified) return genericResponse;

    const rawToken = await this.issueVerificationToken(user);
    await this.mailService.sendVerificationEmail(user.email, user.fullName, rawToken);

    return genericResponse;
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const user = await this.userModel
      .findOne({ email: email.toLowerCase() })
      .select('+password +refreshToken');

    if (!user) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Your account has been disabled.');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (!user.isEmailVerified) {
      throw new UnauthorizedException('Please verify your email before logging in.');
    }

    const { accessToken, refreshToken } = await this.issueTokens(user);
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

  async refresh(dto: RefreshTokenDto) {
    let payload: { sub: string; email: string };
    try {
      payload = await this.jwtService.verifyAsync(dto.refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    const user = await this.userModel.findById(payload.sub).select('+refreshToken');

    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Session no longer valid. Please log in again.');
    }

    const matches = await bcrypt.compare(dto.refreshToken, user.refreshToken);
    if (!matches) {
      user.refreshToken = null;
      await user.save();
      throw new UnauthorizedException('Session no longer valid. Please log in again.');
    }

    const { accessToken, refreshToken } = await this.issueTokens(user);

    return {
      success: true,
      message: 'Token refreshed.',
      accessToken,
      refreshToken,
    };
  }

  async logout(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    user.refreshToken = null;
    await user.save();

    return { success: true, message: 'Logged out successfully.' };
  }

  async profile(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select('-password -refreshToken');

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return { success: true, data: user };
  }

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    const { currentPassword, newPassword, confirmPassword } = changePasswordDto;

    const user = await this.userModel
      .findById(userId)
      .select('+password +refreshToken');

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Current password is incorrect.');
    }

    if (newPassword !== confirmPassword) {
      throw new BadRequestException(
        'New password and confirm password do not match.',
      );
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      throw new BadRequestException(
        'New password must be different from current password.',
      );
    }

    user.password = await bcrypt.hash(newPassword, 12);
    user.refreshToken = null;
    user.lastPasswordChanged = new Date();
    await user.save();

    return {
      success: true,
      message: 'Password changed successfully. Please login again.',
    };
  }
}