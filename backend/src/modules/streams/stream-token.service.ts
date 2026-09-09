import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Signed, short-lived tokens for external HLS/stream links:
 *   token = base64url("<channelId>.<expiresEpochSec>") + "." + hmacSha256(...)
 */
@Injectable()
export class StreamTokenService {
  constructor(private readonly config: ConfigService) {}

  private secret(): string {
    return this.config.get<string>('streamTokenSecret') ?? '';
  }

  sign(channelId: string, ttlSeconds: number): string {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const body = Buffer.from(`${channelId}.${exp}`).toString('base64url');
    const sig = createHmac('sha256', this.secret()).update(body).digest('base64url');
    return `${body}.${sig}`;
  }

  verify(token: string, channelId: string): boolean {
    const [body, sig] = token.split('.');
    if (!body || !sig) return false;
    const expected = createHmac('sha256', this.secret()).update(body).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    const decoded = Buffer.from(body, 'base64url').toString('utf8');
    const [tokenChannel, expStr] = decoded.split('.');
    if (tokenChannel !== channelId) return false;
    return parseInt(expStr, 10) > Math.floor(Date.now() / 1000);
  }
}
