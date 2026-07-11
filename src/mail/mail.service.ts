import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get('MAIL_HOST'),
      port: Number(this.config.get('MAIL_PORT')),
      secure: false,
      auth: {
        user: this.config.get('MAIL_USER'),
        pass: this.config.get('MAIL_PASSWORD'),
      },
    });
  }

  async sendVerificationEmail(to: string, fullName: string, token: string) {
    const url = `${this.config.get('VERIFY_EMAIL_URL')}/${token}`;

    try {
      await this.transporter.sendMail({
        from: this.config.get('MAIL_FROM'),
        to,
        subject: 'Verify your FurniNest account',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#FBF7F2;border-radius:12px;">
            <h2 style="color:#3D2B1F;">FurniNest</h2>
            <p>Hi ${fullName},</p>
            <p>Please confirm your email address to activate your account.</p>
            <a href="${url}" style="display:inline-block;background:#8B5E34;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:12px;">
              Verify Email
            </a>
            <p style="color:#888;font-size:13px;margin-top:24px;">
              This link expires in 15 minutes. If you didn't create this account, you can ignore this email.
            </p>
          </div>
        `,
      });
    } catch (err) {
      this.logger.error(`Failed to send verification email to ${to}: ${(err as Error).message}`);
    }
  }

  async sendPasswordResetEmail(to: string, fullName: string, token: string) {
    const url = `${this.config.get('RESET_PASSWORD_URL')}/${token}`;

    try {
      await this.transporter.sendMail({
        from: this.config.get('MAIL_FROM'),
        to,
        subject: 'Reset your FurniNest password',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#FBF7F2;border-radius:12px;">
            <h2 style="color:#3D2B1F;">FurniNest</h2>
            <p>Hi ${fullName},</p>
            <p>We received a request to reset your password. Click below to choose a new one.</p>
            <a href="${url}" style="display:inline-block;background:#8B5E34;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:12px;">
              Reset Password
            </a>
            <p style="color:#888;font-size:13px;margin-top:24px;">
              This link expires in 15 minutes. If you didn't request this, you can ignore this email.
            </p>
          </div>
        `,
      });
    } catch (err) {
      this.logger.error(`Failed to send reset email to ${to}: ${(err as Error).message}`);
    }
  }
}