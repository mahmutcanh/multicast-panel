import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Response } from 'express';
import { DataSource, Repository } from 'typeorm';
import { promisify } from 'util';
import { EventsService } from '../../common/events.service';
import { PERMISSIONS } from '../../common/permissions';
import { Backup } from '../../database/entities/ops.entities';
import { AuthUser, CurrentUser, RequirePermissions } from '../auth/decorators';

const execFileAsync = promisify(execFile);

@Injectable()
export class BackupsService {
  private readonly logger = new Logger(BackupsService.name);

  constructor(
    @InjectRepository(Backup) private readonly repo: Repository<Backup>,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    private readonly events: EventsService,
  ) {}

  private backupDir(): string {
    return this.config.get<{ backups: string }>('paths')!.backups;
  }

  list() {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  /** pg_dump (custom format) + settings snapshot in one job. */
  async create(type: 'manual' | 'auto', userId: string | null): Promise<Backup> {
    const db = this.config.get<{ host: string; port: number; name: string; user: string; password: string }>('db')!;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `mcp-backup-${stamp}.dump`;
    const filePath = path.join(this.backupDir(), filename);

    const record = await this.repo.save(
      this.repo.create({ filename, path: filePath, type, status: 'running', createdBy: userId }),
    );
    try {
      await fs.mkdir(this.backupDir(), { recursive: true });
      await execFileAsync(
        'pg_dump',
        ['-h', db.host, '-p', String(db.port), '-U', db.user, '-d', db.name, '-F', 'c', '-f', filePath],
        { env: { ...process.env, PGPASSWORD: db.password }, timeout: 600_000 },
      );
      const stat = await fs.stat(filePath);
      record.sizeBytes = String(stat.size);
      record.status = 'done';
      await this.repo.save(record);
      await this.prune();
      return record;
    } catch (err) {
      record.status = 'failed';
      record.error = (err as Error).message;
      await this.repo.save(record);
      await this.events.raiseAlert({
        event: 'backup_failure',
        title: 'Backup failed',
        message: `Backup ${filename} failed: ${(err as Error).message}`,
        severity: 'critical',
      });
      throw new BadRequestException(`Backup failed: ${(err as Error).message}`);
    }
  }

  /** Restores a pg_dump custom-format archive with pg_restore --clean. */
  async restore(id: string): Promise<void> {
    const backup = await this.get(id);
    if (backup.status !== 'done') throw new BadRequestException('Backup is not restorable');
    const db = this.config.get<{ host: string; port: number; name: string; user: string; password: string }>('db')!;
    try {
      await execFileAsync(
        'pg_restore',
        ['-h', db.host, '-p', String(db.port), '-U', db.user, '-d', db.name, '--clean', '--if-exists', backup.path],
        { env: { ...process.env, PGPASSWORD: db.password }, timeout: 600_000 },
      );
      this.logger.warn(`Database restored from ${backup.filename}`);
    } catch (err) {
      throw new BadRequestException(`Restore failed: ${(err as Error).message}`);
    }
  }

  async get(id: string): Promise<Backup> {
    const backup = await this.repo.findOne({ where: { id } });
    if (!backup) throw new NotFoundException('Backup not found');
    return backup;
  }

  async remove(id: string): Promise<void> {
    const backup = await this.get(id);
    await fs.unlink(backup.path).catch(() => undefined);
    await this.repo.remove(backup);
  }

  /** Keeps the newest N backups (system setting backup.keepCount). */
  private async prune(): Promise<void> {
    const rows: { value: number }[] = await this.dataSource.query(
      `SELECT value FROM system_settings WHERE key = 'backup.keepCount'`,
    );
    const keep = Number(rows[0]?.value ?? 14);
    const all = await this.repo.find({ order: { createdAt: 'DESC' } });
    for (const old of all.slice(keep)) {
      await fs.unlink(old.path).catch(() => undefined);
      await this.repo.remove(old);
    }
  }
}

@ApiTags('backups')
@ApiBearerAuth()
@Controller('backups')
export class BackupsController {
  constructor(private readonly service: BackupsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.BACKUP_MANAGE)
  list() {
    return this.service.list();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.BACKUP_MANAGE)
  create(@CurrentUser() user: AuthUser) {
    return this.service.create('manual', user.id);
  }

  @Get(':id/download')
  @RequirePermissions(PERMISSIONS.BACKUP_MANAGE)
  async download(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const backup = await this.service.get(id);
    res.download(backup.path, backup.filename);
  }

  @Post(':id/restore')
  @RequirePermissions(PERMISSIONS.BACKUP_RESTORE)
  @ApiOperation({ summary: 'DANGER: overwrites the current database with the backup contents.' })
  async restore(@Param('id', ParseUUIDPipe) id: string) {
    await this.service.restore(id);
    return { ok: true };
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.BACKUP_MANAGE)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.service.remove(id);
    return { ok: true };
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Backup])],
  controllers: [BackupsController],
  // EventsService provided locally so the module also works in the
  // scheduler app context (no global AuthModule there).
  providers: [BackupsService, EventsService],
  exports: [BackupsService],
})
export class BackupsModule {}
