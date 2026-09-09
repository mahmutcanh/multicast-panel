import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { ApiToken } from '../../database/entities/auth.entities';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY, AuthUser } from './decorators';

function ipToLong(ip: string): number {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
}

/** true when ip matches any CIDR/plain-IP entry */
export function ipAllowed(ip: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true;
  const clean = ip.replace('::ffff:', '');
  if (clean === '::1' || clean === '127.0.0.1') return true;
  return allowlist.some((entry) => {
    if (!entry.includes('/')) return entry === clean;
    const [net, bitsStr] = entry.split('/');
    const bits = parseInt(bitsStr, 10);
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(clean) || Number.isNaN(bits)) return false;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (ipToLong(clean) & mask) === (ipToLong(net) & mask);
  });
}

@Injectable()
export class IpAllowlistGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const allowlist = this.config.get<string[]>('ipAllowlist') ?? [];
    const req = ctx.switchToHttp().getRequest();
    // nginx internal hls-auth subrequest must never be blocked
    if (req.url?.startsWith('/api/v1/streams/hls-auth')) return true;
    if (!ipAllowed(req.ip ?? '', allowlist)) {
      throw new ForbiddenException('IP address not allowed');
    }
    return true;
  }
}

/** Accepts either a panel JWT or an API token (Authorization: Bearer mcp_xxx). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
    @InjectRepository(ApiToken) private readonly tokenRepo: Repository<ApiToken>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers['authorization'] ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw new UnauthorizedException('Missing credentials');

    if (token.startsWith('mcp_')) {
      req.user = await this.validateApiToken(token);
      return true;
    }

    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.config.get('jwt.secret'),
      });
      if (payload.type !== 'access') throw new UnauthorizedException();
      req.user = {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        perms: payload.perms ?? [],
        via: 'jwt',
      } satisfies AuthUser;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private async validateApiToken(raw: string): Promise<AuthUser> {
    const hash = createHash('sha256').update(raw).digest('hex');
    const record = await this.tokenRepo
      .createQueryBuilder('t')
      .addSelect('t.tokenHash')
      .leftJoinAndSelect('t.user', 'user')
      .where('t.token_hash = :hash', { hash })
      .getOne();
    if (!record || record.revokedAt) throw new UnauthorizedException('Invalid API token');
    if (record.expiresAt && record.expiresAt < new Date()) {
      throw new UnauthorizedException('API token expired');
    }
    if (!record.user?.isActive) throw new UnauthorizedException('User disabled');
    void this.tokenRepo.update(record.id, { lastUsedAt: new Date() });
    return {
      id: record.user.id,
      email: record.user.email,
      name: record.user.name,
      perms: record.scopes ?? [],
      via: 'api-token',
    };
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const user: AuthUser | undefined = ctx.switchToHttp().getRequest().user;
    if (!user) return false;
    const ok = required.every((p) => user.perms.includes(p));
    if (!ok) throw new ForbiddenException('Insufficient permissions');
    return true;
  }
}
