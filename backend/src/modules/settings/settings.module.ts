import { Body, Controller, Get, Injectable, Module, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { IsObject } from 'class-validator';
import * as os from 'os';
import { Repository } from 'typeorm';
import { PERMISSIONS } from '../../common/permissions';
import { SystemSetting } from '../../database/entities/ops.entities';
import { RequirePermissions } from '../auth/decorators';

// Only these keys may be changed from the panel.
const EDITABLE_KEYS = new Set([
  'storage.mediaPath', 'storage.hlsPath', 'storage.backupPath',
  'ffmpeg.path', 'ffprobe.path',
  'network.interfaceIp', 'network.publicUrl', 'network.localDomain', 'network.sslMode',
  'panel.defaultLocale',
  'backup.dailyEnabled', 'backup.keepCount',
]);

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(SystemSetting) private readonly repo: Repository<SystemSetting>,
  ) {}

  async all(): Promise<Record<string, unknown>> {
    const rows = await this.repo.find();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  async get<T = unknown>(key: string, fallback?: T): Promise<T> {
    const row = await this.repo.findOne({ where: { key } });
    return (row?.value as T) ?? (fallback as T);
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.repo.save({ key, value });
  }

  async updateMany(values: Record<string, unknown>): Promise<Record<string, unknown>> {
    for (const [key, value] of Object.entries(values)) {
      if (!EDITABLE_KEYS.has(key)) continue;
      await this.set(key, value);
    }
    return this.all();
  }

  /** Network interfaces of this host (for multicast egress selection). */
  interfaces(): { name: string; ip: string }[] {
    const result: { name: string; ip: string }[] = [];
    for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
      for (const addr of addrs ?? []) {
        if (addr.family === 'IPv4' && !addr.internal) result.push({ name, ip: addr.address });
      }
    }
    return result;
  }
}

class UpdateSettingsDto {
  @IsObject() values: Record<string, unknown>;
}

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SYSTEM_SETTINGS)
  all() {
    return this.service.all();
  }

  @Get('interfaces')
  @RequirePermissions(PERMISSIONS.SYSTEM_SETTINGS)
  interfaces() {
    return this.service.interfaces();
  }

  @Put()
  @RequirePermissions(PERMISSIONS.SYSTEM_SETTINGS)
  update(@Body() dto: UpdateSettingsDto) {
    return this.service.updateMany(dto.values);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([SystemSetting])],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
