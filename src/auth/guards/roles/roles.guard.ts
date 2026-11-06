import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const { user, method, url } = req;

    if (!user || !user.role) {
      this.logger.warn(`[ROLES 403] ${method} ${url} - Missing user or role in token`);
      throw new ForbiddenException('Access denied. No user role identified.');
    }

    const userRole = String(user.role).trim().toUpperCase();
    const normalizedRequired = requiredRoles.map((r) => String(r).trim().toUpperCase());

    if (!normalizedRequired.includes(userRole)) {
      this.logger.warn(
        `[ROLES 403] ${method} ${url} - User role "${userRole}" not authorized. Required: [${normalizedRequired.join(', ')}]`,
      );
      throw new ForbiddenException('Access denied. Only admins can perform this action.');
    }

    return true;
  }
}
