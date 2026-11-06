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
      const method = req.method;
      const url = req.url;
      const reason = info?.message || err?.message || 'Token verification failed';

      this.logger.warn(
        `[JWT 401 UNAUTHORIZED] ${method} ${url} | Reason: "${reason}" | Authorization header present: ${Boolean(
          authHeader,
        )} | x-access-token present: ${Boolean(xAccessToken)}`,
      );

      throw (
        err ||
        new UnauthorizedException(
          `Unauthorized: ${reason}. Please ensure a valid token is provided.`,
        )
      );
    }

    return user;
  }
}
