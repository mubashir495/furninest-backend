import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';


export const CurrentUser = createParamDecorator(
  (field: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('User not found on request. Check JwtAuthGuard/JwtStrategy.');
    }

    const value = field ? user?.[field] : user;

    if (field && (value === undefined || value === null)) {
      throw new UnauthorizedException(
        `Field "${field}" missing on req.user. Check JwtStrategy.validate() return shape.`,
      );
    }

    return value;
  },
);