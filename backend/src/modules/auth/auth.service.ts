import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { randomBytes, randomUUID } from 'crypto';
import Redis from 'ioredis';
import { authenticator } from 'otplib';
import * as qrcode from 'qrcode';
import { Repository } from 'typeorm';
import { EventsService } from '../../common/events.service';
import { MailService } from '../../common/mail.service';
import { REDIS } from '../../common/redis.module';
import { LoginHistory, User } from '../../database/entities/auth.entities';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(LoginHistory) private readonly history: Repository<LoginHistory>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly events: EventsService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  // ── Login ──────────────────────────────────────────────────────────────

  async login(email: string, password: string, ip: string, userAgent: string) {
    const user = await this.users
      .createQueryBuilder('u')
      .addSelect(['u.passwordHash'])
      .leftJoinAndSelect('u.roles', 'roles')
      .leftJoinAndSelect('roles.permissions', 'perms')
      .where('u.email = :email', { email: email.toLowerCase() })
      .getOne();

    const fail = async (reason: string) => {
      await this.history.save(
        this.history.create({ userId: user?.id ?? null, email, ip, userAgent, success: false, reason }),
      );
      if (user) await this.bumpFailedLogins(user, ip);
      throw new UnauthorizedException('Invalid credentials');
    };

    if (!user || !user.isActive) return fail(user ? 'account disabled' : 'unknown user');
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.history.save(
        this.history.create({ userId: user.id, email, ip, userAgent, success: false, reason: 'locked' }),
      );
      throw new UnauthorizedException('Account temporarily locked. Try again later.');
    }
    if (!(await argon2.verify(user.passwordHash, password))) return fail('wrong password');

    if (user.mfaEnabled) {
      const mfaToken = await this.jwt.signAsync(
        { sub: user.id, type: 'mfa' },
        { secret: this.config.get('jwt.secret'), expiresIn: '5m' },
      );
      return { mfaRequired: true as const, mfaToken };
    }
    return this.completeLogin(user, ip, userAgent);
  }

  async verifyMfa(mfaToken: string, code: string, ip: string, userAgent: string) {
    let payload: { sub: string; type: string };
    try {
      payload = await this.jwt.verifyAsync(mfaToken, { secret: this.config.get('jwt.secret') });
    } catch {
      throw new UnauthorizedException('MFA session expired');
    }
    if (payload.type !== 'mfa') throw new UnauthorizedException();

    const user = await this.userWithSecrets(payload.sub);
    if (!user?.mfaSecret) throw new UnauthorizedException();

    const isTotp = authenticator.verify({ token: code, secret: user.mfaSecret });
    const isRecovery = !isTotp && (user.mfaRecoveryCodes ?? []).includes(code.toUpperCase());
    if (!isTotp && !isRecovery) {
      await this.history.save(
        this.history.create({ userId: user.id, email: user.email, ip, userAgent, success: false, reason: 'bad mfa code' }),
      );
      throw new UnauthorizedException('Invalid MFA code');
    }
    if (isRecovery) {
      user.mfaRecoveryCodes = (user.mfaRecoveryCodes ?? []).filter((c) => c !== code.toUpperCase());
      await this.users.save(user);
    }
    return this.completeLogin(user, ip, userAgent);
  }

  private async completeLogin(user: User, ip: string, userAgent: string) {
    await this.users.update(user.id, {
      lastLoginAt: new Date(),
      failedLoginCount: 0,
      lockedUntil: null,
    });
    await this.history.save(
      this.history.create({ userId: user.id, email: user.email, ip, userAgent, success: true }),
    );
    const tokens = await this.issueTokens(user);
    return { mfaRequired: false as const, user: this.publicUser(user), ...tokens };
  }

  private async bumpFailedLogins(user: User, ip: string): Promise<void> {
    const count = user.failedLoginCount + 1;
    const update: Partial<User> = { failedLoginCount: count };
    if (count >= MAX_FAILED_LOGINS) {
      update.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
      update.failedLoginCount = 0;
      await this.events.raiseAlert({
        event: 'login_failures',
        title: 'Repeated failed logins',
        message: `Account ${user.email} locked for ${LOCK_MINUTES}m after ${MAX_FAILED_LOGINS} failed attempts (last IP ${ip}).`,
        severity: 'warning',
      });
    }
    await this.users.update(user.id, update);
  }

  // ── Tokens ─────────────────────────────────────────────────────────────

  async issueTokens(user: User): Promise<TokenPair> {
    const perms = [...new Set((user.roles ?? []).flatMap((r) => (r.permissions ?? []).map((p) => p.slug)))];
    const accessTtl = this.config.get<number>('jwt.accessTtl') ?? 900;
    const refreshTtl = this.config.get<number>('jwt.refreshTtl') ?? 604800;
    const jti = randomUUID();

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, name: user.name, perms, type: 'access' },
      { secret: this.config.get('jwt.secret'), expiresIn: accessTtl },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, jti, type: 'refresh' },
      { secret: this.config.get('jwt.refreshSecret'), expiresIn: refreshTtl },
    );
    await this.redis.set(`refresh:${jti}`, user.id, 'EX', refreshTtl);
    return { accessToken, refreshToken, expiresIn: accessTtl };
  }

  /** Rotating refresh: old jti is revoked, a new pair is issued. */
  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: { sub: string; jti: string; type: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (payload.type !== 'refresh') throw new UnauthorizedException();
    const key = `refresh:${payload.jti}`;
    const userId = await this.redis.get(key);
    if (!userId || userId !== payload.sub) throw new UnauthorizedException('Refresh token revoked');
    await this.redis.del(key);

    const user = await this.users.findOne({ where: { id: userId } });
    if (!user || !user.isActive) throw new UnauthorizedException();
    return this.issueTokens(user);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    try {
      const payload = await this.jwt.verifyAsync<{ jti: string }>(refreshToken, {
        secret: this.config.get('jwt.refreshSecret'),
      });
      await this.redis.del(`refresh:${payload.jti}`);
    } catch {
      /* already invalid — nothing to revoke */
    }
  }

  // ── MFA management ─────────────────────────────────────────────────────

  async mfaSetup(userId: string) {
    const user = await this.userWithSecrets(userId);
    if (!user) throw new UnauthorizedException();
    const secret = authenticator.generateSecret();
    await this.redis.set(`mfa-setup:${userId}`, secret, 'EX', 600);
    const otpauth = authenticator.keyuri(user.email, 'Multicast Control Panel', secret);
    const qr = await qrcode.toDataURL(otpauth);
    return { secret, otpauth, qr };
  }

  async mfaEnable(userId: string, code: string) {
    const secret = await this.redis.get(`mfa-setup:${userId}`);
    if (!secret) throw new BadRequestException('MFA setup expired — start again');
    if (!authenticator.verify({ token: code, secret })) {
      throw new BadRequestException('Invalid code');
    }
    const recoveryCodes = Array.from({ length: 8 }, () =>
      randomBytes(5).toString('hex').toUpperCase(),
    );
    await this.users.update(userId, {
      mfaEnabled: true,
      mfaSecret: secret,
      mfaRecoveryCodes: recoveryCodes,
    });
    await this.redis.del(`mfa-setup:${userId}`);
    return { recoveryCodes };
  }

  async mfaDisable(userId: string, password: string, code: string): Promise<void> {
    const user = await this.userWithSecrets(userId);
    if (!user?.mfaSecret) throw new BadRequestException('MFA is not enabled');
    if (!(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Wrong password');
    }
    const ok =
      authenticator.verify({ token: code, secret: user.mfaSecret }) ||
      (user.mfaRecoveryCodes ?? []).includes(code.toUpperCase());
    if (!ok) throw new UnauthorizedException('Invalid MFA code');
    await this.users.update(userId, { mfaEnabled: false, mfaSecret: null, mfaRecoveryCodes: null });
  }

  // ── Password reset / email verification ────────────────────────────────

  async forgotPassword(email: string): Promise<void> {
    const user = await this.users.findOne({ where: { email: email.toLowerCase() } });
    // Always succeed silently — do not leak account existence.
    if (!user) return;
    const token = randomBytes(32).toString('hex');
    await this.redis.set(`pwreset:${token}`, user.id, 'EX', 3600);
    const url = `${this.config.get('publicUrl')}/reset-password?token=${token}`;
    await this.mail.send(
      user.email,
      'Password reset — Multicast Control Panel',
      `<p>Reset your password (valid 1 hour):</p><p><a href="${url}">${url}</a></p>`,
    );
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const userId = await this.redis.get(`pwreset:${token}`);
    if (!userId) throw new BadRequestException('Invalid or expired reset token');
    await this.users.update(userId, { passwordHash: await argon2.hash(password) });
    await this.redis.del(`pwreset:${token}`);
  }

  async changePassword(userId: string, current: string, next: string): Promise<void> {
    const user = await this.userWithSecrets(userId);
    if (!user) throw new UnauthorizedException();
    if (!(await argon2.verify(user.passwordHash, current))) {
      throw new UnauthorizedException('Current password is wrong');
    }
    await this.users.update(userId, { passwordHash: await argon2.hash(next) });
  }

  async sendVerificationEmail(user: User): Promise<void> {
    const token = randomBytes(32).toString('hex');
    await this.redis.set(`verify:${token}`, user.id, 'EX', 86400);
    const url = `${this.config.get('publicUrl')}/api/v1/auth/verify-email?token=${token}`;
    await this.mail.send(
      user.email,
      'Verify your email — Multicast Control Panel',
      `<p>Verify your email:</p><p><a href="${url}">${url}</a></p>`,
    );
  }

  async verifyEmail(token: string): Promise<void> {
    const userId = await this.redis.get(`verify:${token}`);
    if (!userId) throw new BadRequestException('Invalid or expired verification token');
    await this.users.update(userId, { emailVerifiedAt: new Date() });
    await this.redis.del(`verify:${token}`);
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  async me(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return this.publicUser(user);
  }

  async loginHistory(page: number, limit: number) {
    const [items, total] = await this.history.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total };
  }

  private userWithSecrets(userId: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('u')
      .addSelect(['u.passwordHash', 'u.mfaSecret', 'u.mfaRecoveryCodes'])
      .leftJoinAndSelect('u.roles', 'roles')
      .leftJoinAndSelect('roles.permissions', 'perms')
      .where('u.id = :id', { id: userId })
      .getOne();
  }

  private publicUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      locale: user.locale,
      mfaEnabled: user.mfaEnabled,
      roles: (user.roles ?? []).map((r) => ({ id: r.id, name: r.name, slug: r.slug })),
      permissions: [
        ...new Set((user.roles ?? []).flatMap((r) => (r.permissions ?? []).map((p) => p.slug))),
      ],
    };
  }
}
