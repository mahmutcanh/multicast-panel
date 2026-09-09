import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { PermissionSlug } from '../../common/permissions';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSIONS_KEY = 'requiredPermissions';
export const RequirePermissions = (...perms: PermissionSlug[]) =>
  SetMetadata(PERMISSIONS_KEY, perms);

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  perms: string[];
  via: 'jwt' | 'api-token';
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);
