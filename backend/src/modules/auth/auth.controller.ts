import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { PaginationDto, paginated } from '../../common/http.common';
import { PERMISSIONS } from '../../common/permissions';
import { AuthService } from './auth.service';
import { AuthUser, CurrentUser, Public, RequirePermissions } from './decorators';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  MfaDisableDto,
  MfaEnableDto,
  MfaVerifyDto,
  ResetPasswordDto,
} from './dto';

const REFRESH_COOKIE = 'mcp_refresh';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  private setRefreshCookie(res: Response, token: string, remember: boolean): void {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: this.config.get('secureCookies') === true,
      sameSite: 'strict',
      path: '/api/v1/auth',
      // session cookie unless "remember me"
      maxAge: remember ? (this.config.get<number>('jwt.refreshTtl') ?? 604800) * 1000 : undefined,
    });
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @ApiOperation({ summary: 'Login with email/password. May require MFA step.' })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto.email, dto.password, req.ip ?? '', req.headers['user-agent'] ?? '');
    if (!result.mfaRequired) {
      this.setRefreshCookie(res, result.refreshToken, dto.rememberMe === true);
      const { refreshToken: _refresh, ...rest } = result;
      return rest;
    }
    return result;
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('mfa/verify')
  @ApiOperation({ summary: 'Complete login with a TOTP or recovery code.' })
  async verifyMfa(@Body() dto: MfaVerifyDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.verifyMfa(dto.mfaToken, dto.code, req.ip ?? '', req.headers['user-agent'] ?? '');
    this.setRefreshCookie(res, result.refreshToken, false);
    const { refreshToken: _refresh, ...rest } = result;
    return rest;
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Rotate refresh token (cookie-based).' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // CSRF mitigation: samesite=strict cookie + custom header requirement.
    if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
      res.status(403);
      return { __raw: { success: false, data: null, error: 'Missing CSRF header' } };
    }
    const token = req.cookies?.[REFRESH_COOKIE];
    const pair = await this.auth.refresh(token);
    this.setRefreshCookie(res, pair.refreshToken, true);
    return { accessToken: pair.accessToken, expiresIn: pair.expiresIn };
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    return { ok: true };
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  // ── MFA self-service ──
  @ApiBearerAuth()
  @Post('mfa/setup')
  mfaSetup(@CurrentUser() user: AuthUser) {
    return this.auth.mfaSetup(user.id);
  }

  @ApiBearerAuth()
  @Post('mfa/enable')
  mfaEnable(@CurrentUser() user: AuthUser, @Body() dto: MfaEnableDto) {
    return this.auth.mfaEnable(user.id, dto.code);
  }

  @ApiBearerAuth()
  @Post('mfa/disable')
  async mfaDisable(@CurrentUser() user: AuthUser, @Body() dto: MfaDisableDto) {
    await this.auth.mfaDisable(user.id, dto.password, dto.code);
    return { ok: true };
  }

  // ── Password flows ──
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  async forgot(@Body() dto: ForgotPasswordDto) {
    await this.auth.forgotPassword(dto.email);
    return { ok: true };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  async reset(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.token, dto.password);
    return { ok: true };
  }

  @ApiBearerAuth()
  @Post('change-password')
  async changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    await this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword);
    return { ok: true };
  }

  @Public()
  @Get('verify-email')
  async verifyEmail(@Query('token') token: string) {
    await this.auth.verifyEmail(token);
    return { ok: true };
  }

  // ── Login history (security screen) ──
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.LOGS_VIEW)
  @Get('login-history')
  async history(@Query() dto: PaginationDto) {
    const { items, total } = await this.auth.loginHistory(dto.page, dto.limit);
    return paginated(items, total, dto);
  }
}
