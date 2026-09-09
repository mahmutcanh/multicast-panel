import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { EventsService } from '../common/events.service';
import { SystemSetting } from '../database/entities/ops.entities';
import { Channel, StreamLog } from '../database/entities/streaming.entities';
import { BackupsService } from '../modules/backups/backups.module';

const LOG_RETENTION_DAYS = 14;

/**
 * Cron duties: scheduled channel playout (HH:mm windows), automatic daily
 * backups, and log retention. Runs as its own container (scheduler).
 */
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @InjectRepository(Channel) private readonly channels: Repository<Channel>,
    @InjectRepository(StreamLog) private readonly streamLogs: Repository<StreamLog>,
    @InjectRepository(SystemSetting) private readonly settings: Repository<SystemSetting>,
    private readonly events: EventsService,
    private readonly backups: BackupsService,
  ) {}

  /** Channel schedule check — every minute. schedule = { enabled, startCron: "HH:mm", stopCron: "HH:mm", days?: number[] } */
  @Cron('* * * * *')
  async checkSchedules(): Promise<void> {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const day = now.getDay();

    const scheduled = await this.channels
      .createQueryBuilder('c')
      .where(`c.schedule ->> 'enabled' = 'true'`)
      .getMany();

    for (const channel of scheduled) {
      const s = channel.schedule as unknown as {
        enabled: boolean;
        startCron?: string;
        stopCron?: string;
        days?: number[];
      };
      if (s.days?.length && !s.days.includes(day)) continue;
      if (s.startCron === hhmm && channel.status !== 'running') {
        this.logger.log(`Schedule start: ${channel.name}`);
        await this.events.sendCommand({ type: 'start', channelId: channel.id });
      }
      if (s.stopCron === hhmm && channel.status === 'running') {
        this.logger.log(`Schedule stop: ${channel.name}`);
        await this.events.sendCommand({ type: 'stop', channelId: channel.id });
      }
    }
  }

  /** Automatic daily backup at 03:30. */
  @Cron('30 3 * * *')
  async dailyBackup(): Promise<void> {
    const enabled = await this.settings.findOne({ where: { key: 'backup.dailyEnabled' } });
    if (enabled?.value === false) return;
    this.logger.log('Running automatic daily backup...');
    await this.backups.create('auto', null).catch((err) =>
      this.logger.error(`Daily backup failed: ${err.message}`),
    );
  }

  /** Prune stream logs older than the retention window — daily at 04:10. */
  @Cron('10 4 * * *')
  async pruneLogs(): Promise<void> {
    const cutoff = new Date(Date.now() - LOG_RETENTION_DAYS * 86_400_000);
    const result = await this.streamLogs.delete({ createdAt: LessThan(cutoff) });
    this.logger.log(`Pruned ${result.affected ?? 0} old stream log rows.`);
  }
}
