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

        // 2. Cookie extraction (access_token or furninest_token)
        (req: Request) => {
          if (!req) return null;
          // From parsed cookies (cookie-parser)
          if (req.cookies?.access_token) return req.cookies.access_token;
          if (req.cookies?.furninest_token) return req.cookies.furninest_token;

          // Raw cookie string fallback
          if (req.headers?.cookie) {
            const matchAccessToken = req.headers.cookie.match(/(?:^|;\s*)access_token=([^;]+)/);
            if (matchAccessToken) return decodeURIComponent(matchAccessToken[1]);

            const matchFurninestToken = req.headers.cookie.match(/(?:^|;\s*)furninest_token=([^;]+)/);
            if (matchFurninestToken) return decodeURIComponent(matchFurninestToken[1]);
          }

          return null;
        },

        // 3. Custom header x-access-token (never stripped by Apache / LiteSpeed proxies)
        ExtractJwt.fromHeader('x-access-token'),

        // 4. Apache mod_rewrite HTTP_AUTHORIZATION header
        (req: Request) => {
          if (!req) return null;
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
      userId: payload.sub,
      email: payload.email,
      role: (payload.role || '').toUpperCase(),
    };
  }
}
