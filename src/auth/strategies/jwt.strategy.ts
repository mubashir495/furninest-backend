import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(private readonly configService: ConfigService) {
    const secret =
      configService.get<string>('JWT_ACCESS_SECRET') ||
      configService.get<string>('JWT_SECRET') ||
      process.env.JWT_ACCESS_SECRET ||
      process.env.JWT_SECRET ||
      'furninest_jwt_access_fallback_secret_key_2026';

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        // 1. Standard Authorization: Bearer <token>
        ExtractJwt.fromAuthHeaderAsBearerToken(),

        // 2. Custom header x-access-token (never stripped by Apache / Hostinger proxies)
        ExtractJwt.fromHeader('x-access-token'),

        // 3. Fallback for Apache mod_rewrite HTTP_AUTHORIZATION or cookie
        (req: Request) => {
          if (!req) return null;

          // Apache / LiteSpeed rewritten header
          const apacheAuth =
            req.headers?.['http_authorization'] ||
            req.headers?.['http-authorization'];
          if (typeof apacheAuth === 'string') {
            const clean = apacheAuth.trim();
            if (clean.toLowerCase().startsWith('bearer ')) {
              return clean.slice(7).trim();
            }
            return clean;
          }

          // Cookie fallback if present
          if (req.headers?.cookie) {
            const match = req.headers.cookie.match(/(?:^|;\s*)furninest_token=([^;]+)/);
            if (match) {
              return decodeURIComponent(match[1]);
            }
          }

          return null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: any) {
    return {
      id: payload.sub,
      email: payload.email,
      role: (payload.role || '').toUpperCase(),
    };
  }
}
