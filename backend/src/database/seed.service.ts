import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import * as argon2 from 'argon2';
import { Permission, Role, User } from './entities/auth.entities';
import { Channel, ChannelOutput, StreamingNode } from './entities/streaming.entities';
import { AlertSetting, License, SystemSetting } from './entities/ops.entities';
import { DEFAULT_ROLES, PERMISSION_DEFS } from '../common/permissions';

const DEFAULT_ALERT_EVENTS = {
  stream_offline: { enabled: true },
  ffmpeg_crash: { enabled: true },
  auto_restart: { enabled: true },
  high_cpu: { enabled: true, threshold: 90 },
  high_ram: { enabled: true, threshold: 90 },
  low_disk: { enabled: true, threshold: 10 },
  bitrate_drop: { enabled: true, threshold: 50 },
  login_failures: { enabled: true, threshold: 5 },
  backup_failure: { enabled: true },
};

/** Idempotent seeder — safe to run on every API boot. */
@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async run(): Promise<void> {
    await this.seedPermissions();
    await this.seedRoles();
    await this.seedNode();
    await this.seedSettings();
    await this.seedAlertSettings();
    await this.seedLicense();
    await this.seedAdminFromEnv();
    await this.seedSampleChannels();
  }

  private async seedPermissions(): Promise<void> {
    const repo = this.dataSource.getRepository(Permission);
    for (const def of PERMISSION_DEFS) {
      const existing = await repo.findOne({ where: { slug: def.slug } });
      if (!existing) {
        await repo.save(repo.create({ slug: def.slug, group: def.group, description: def.description }));
      }
    }
  }

  private async seedRoles(): Promise<void> {
    const roleRepo = this.dataSource.getRepository(Role);
    const permRepo = this.dataSource.getRepository(Permission);
    const allPerms = await permRepo.find();
    for (const def of DEFAULT_ROLES) {
      let role = await roleRepo.findOne({ where: { slug: def.slug } });
      const perms = allPerms.filter((p) => (def.permissions as string[]).includes(p.slug));
      if (!role) {
        role = roleRepo.create({
          name: def.name,
          slug: def.slug,
          description: def.description,
          isSystem: def.isSystem,
          permissions: perms,
        });
      } else {
        // keep system role permissions in sync with the catalogue
        role.permissions = perms;
      }
      await roleRepo.save(role);
    }
  }

  private async seedNode(): Promise<void> {
    const repo = this.dataSource.getRepository(StreamingNode);
    const existing = await repo.findOne({ where: { name: 'local' } });
    if (!existing) {
      await repo.save(repo.create({ name: 'local', host: '127.0.0.1', role: 'local', status: 'online' }));
    }
  }

  private async seedSettings(): Promise<void> {
    const repo = this.dataSource.getRepository(SystemSetting);
    const defaults: Record<string, unknown> = {
      installed: false,
      'storage.mediaPath': '/data/media',
      'storage.hlsPath': '/data/hls',
      'storage.backupPath': '/data/backups',
      'ffmpeg.path': this.config.get('ffmpegPath'),
      'ffprobe.path': this.config.get('ffprobePath'),
      'network.interfaceIp': this.config.get('multicastInterfaceIp') ?? '',
      'network.publicUrl': this.config.get('publicUrl'),
      'network.localDomain': process.env.LOCAL_DOMAIN ?? '',
      'network.sslMode': process.env.SSL_MODE ?? 'none',
      'panel.defaultLocale': this.config.get('defaultLocale'),
      'backup.dailyEnabled': true,
      'backup.keepCount': 14,
    };
    for (const [key, value] of Object.entries(defaults)) {
      const existing = await repo.findOne({ where: { key } });
      if (!existing) await repo.save(repo.create({ key, value }));
    }
  }

  private async seedAlertSettings(): Promise<void> {
    const repo = this.dataSource.getRepository(AlertSetting);
    const count = await repo.count();
    if (count === 0) {
      await repo.save(repo.create({ events: DEFAULT_ALERT_EVENTS }));
    }
  }

  private async seedLicense(): Promise<void> {
    const repo = this.dataSource.getRepository(License);
    const count = await repo.count();
    if (count === 0) {
      await repo.save(
        repo.create({
          status: 'trial',
          mode: 'offline',
          features: { maxChannels: 0, hls: true, srt: true, rtmp: true, multiNode: false },
        }),
      );
    }
  }

  private async seedAdminFromEnv(): Promise<void> {
    const admin = this.config.get<{ email: string; password: string; name: string }>('admin');
    if (!admin?.email || !admin?.password) return;
    const userRepo = this.dataSource.getRepository(User);
    const existing = await userRepo.findOne({ where: { email: admin.email.toLowerCase() } });
    if (existing) return;

    const roleRepo = this.dataSource.getRepository(Role);
    const superAdmin = await roleRepo.findOne({ where: { slug: 'super-admin' } });
    await userRepo.save(
      userRepo.create({
        email: admin.email.toLowerCase(),
        passwordHash: await argon2.hash(admin.password),
        name: admin.name || 'Administrator',
        emailVerifiedAt: new Date(),
        roles: superAdmin ? [superAdmin] : [],
      }),
    );
    // env-seeded admin means installer is not needed
    const settings = this.dataSource.getRepository(SystemSetting);
    await settings.save({ key: 'installed', value: true });
    this.logger.log(`Seeded admin user ${admin.email} from environment.`);
  }

  private async seedSampleChannels(): Promise<void> {
    const chRepo = this.dataSource.getRepository(Channel);
    if ((await chRepo.count()) > 0) return;
    const outRepo = this.dataSource.getRepository(ChannelOutput);
    const nodeRepo = this.dataSource.getRepository(StreamingNode);
    const node = await nodeRepo.findOne({ where: { name: 'local' } });

    const samples = [
      { name: 'Test Channel 1', udpIp: '230.120.5.98', udpPort: 1234 },
      { name: 'Test Channel 2', udpIp: '230.120.5.99', udpPort: 1234 },
    ];
    for (const s of samples) {
      const ch = await chRepo.save(
        chRepo.create({
          name: s.name,
          category: 'Test',
          description: 'Built-in test pattern channel (color bars + tone)',
          sourceType: 'test_pattern',
          udpIp: s.udpIp,
          udpPort: s.udpPort,
          copyMode: false,
          videoBitrate: '3000k',
          resolution: '1280x720',
          fps: 25,
          autoRestart: true,
          nodeId: node?.id ?? null,
        }),
      );
      await outRepo.save(outRepo.create({ channelId: ch.id, type: 'udp', enabled: true }));
    }
    this.logger.log('Seeded 2 sample test-pattern channels (230.120.5.98/.99:1234).');
  }
}
