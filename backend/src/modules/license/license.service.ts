import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createPublicKey, verify as edVerify } from 'crypto';
import { Repository } from 'typeorm';
import { License } from '../../database/entities/ops.entities';

/**
 * Offline license validation (v1).
 *
 * Key format:  MCP1.<base64url(payload-json)>.<base64url(ed25519-signature)>
 * Payload:     { licensedTo, expiresAt, features: { maxChannels, hls, srt, rtmp, multiNode } }
 *
 * Signatures are verified against the vendor Ed25519 public key
 * (LICENSE_PUBLIC_KEY env, PEM/SPKI base64). Without a configured public key
 * the panel runs in internal/trial mode (all features, unlimited channels).
 * An online validation service can plug into validateRemote() later.
 */
@Injectable()
export class LicenseService {
  private readonly logger = new Logger(LicenseService.name);

  constructor(@InjectRepository(License) private readonly repo: Repository<License>) {}

  async current(): Promise<License> {
    let license = await this.repo.findOne({ where: {}, order: { createdAt: 'ASC' } });
    if (!license) {
      license = await this.repo.save(this.repo.create({ status: 'trial', mode: 'offline' }));
    }
    return this.refreshStatus(license);
  }

  async activate(key: string): Promise<License> {
    const parsed = this.verifyKey(key);
    const license = await this.current();
    license.licenseKey = key;
    license.licensedTo = parsed.licensedTo ?? '';
    license.features = parsed.features ?? {};
    license.expiresAt = parsed.expiresAt ? new Date(parsed.expiresAt) : null;
    license.status = 'active';
    license.activatedAt = new Date();
    license.lastValidatedAt = new Date();
    return this.repo.save(license);
  }

  async maxChannels(): Promise<number> {
    const license = await this.current();
    if (license.status === 'expired' || license.status === 'invalid') return 2; // hard floor
    const max = license.features?.maxChannels;
    return typeof max === 'number' ? max : 0; // 0 = unlimited
  }

  /** Re-evaluates expiry / grace period. */
  private async refreshStatus(license: License): Promise<License> {
    if (license.status === 'trial' || !license.expiresAt) return license;
    const now = Date.now();
    const expiry = license.expiresAt.getTime();
    const graceEnd = expiry + license.graceDays * 86_400_000;
    let status: License['status'];
    if (now < expiry) status = 'active';
    else if (now < graceEnd) status = 'grace';
    else status = 'expired';
    if (status !== license.status) {
      license.status = status;
      await this.repo.save(license);
      this.logger.warn(`License status changed to ${status}`);
    }
    return license;
  }

  private verifyKey(key: string): {
    licensedTo?: string;
    expiresAt?: string;
    features?: Record<string, boolean | number>;
  } {
    const parts = key.trim().split('.');
    if (parts.length !== 3 || parts[0] !== 'MCP1') {
      throw new BadRequestException('Invalid license key format');
    }
    const [, payloadB64, sigB64] = parts;
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid license payload');
    }
    const publicKeyPem = process.env.LICENSE_PUBLIC_KEY;
    if (publicKeyPem) {
      const ok = edVerify(
        null,
        Buffer.from(payloadB64, 'utf8'),
        createPublicKey(publicKeyPem.replace(/\\n/g, '\n')),
        Buffer.from(sigB64, 'base64url'),
      );
      if (!ok) throw new BadRequestException('License signature verification failed');
    } else {
      this.logger.warn('LICENSE_PUBLIC_KEY not set — accepting key in internal/offline mode.');
    }
    return payload as ReturnType<LicenseService['verifyKey']>;
  }
}
