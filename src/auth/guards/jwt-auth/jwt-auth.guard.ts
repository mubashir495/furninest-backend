import {
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    if (err || !user) {
      const req = context.switchToHttp().getRequest();
      const authHeader = req.headers?.authorization;
      const xAccessToken = req.headers?.['x-access-token'];
      const cookieHeader = req.headers?.cookie;
      const parsedCookie =
        req.cookies?.access_token || req.cookies?.furninest_token;
      const method = req.method;
      const url = req.url;

      // Extract exact verification error reason
      const exactError =
        info?.name === 'TokenExpiredError'
          ? 'jwt expired'
          : info?.name === 'JsonWebTokenError'
            ? info?.message || 'invalid signature / jwt malformed'
            : info?.message || err?.message || 'Token verification failed';

      this.logger.warn(
        `[JWT 401 UNAUTHORIZED] ${method} ${url} | Exact Error: "${exactError}" | ` +
          `Authorization Header: ${Boolean(authHeader)} | ` +
          `x-access-token: ${Boolean(xAccessToken)} | ` +
          `Cookie Present: ${Boolean(parsedCookie || cookieHeader)}`,
      );

      throw (
        err ||
        new UnauthorizedException(
          `Unauthorized: ${exactError}. Please provide a valid token via Authorization header, x-access-token, or access_token cookie.`,
        )
      );
    }

    return user;
  }
}
