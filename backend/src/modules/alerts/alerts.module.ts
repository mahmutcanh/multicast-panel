import {
  Body,
  Controller,
  Get,
  Inject,
  Injectable,
  Logger,
  Module,
  OnApplicationBootstrap,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { IsBoolean, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import Redis from 'ioredis';
import { Repository } from 'typeorm';
import { AlertEvent, CH_ALERT } from '../../common/events.service';
import { PaginationDto, paginated } from '../../common/http.common';
import { MailService } from '../../common/mail.service';
import { PERMISSIONS } from '../../common/permissions';
import { REDIS_SUB } from '../../common/redis.module';
import { AlertSetting, Notification } from '../../database/entities/ops.entities';
import { RequirePermissions } from '../auth/decorators';

class UpdateAlertSettingsDto {
  @IsOptional() @IsBoolean() telegramEnabled?: boolean;
  @IsOptional() @IsString() @MaxLength(200) telegramBotToken?: string;
  @IsOptional() @IsString() @MaxLength(100) telegramChatId?: string;
  @IsOptional() @IsBoolean() emailEnabled?: boolean;
  @IsOptional() @IsString() @MaxLength(500) emailTo?: string;
  @IsOptional() @IsBoolean() webhookEnabled?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) webhookUrl?: string;
  @IsOptional() @IsString() @MaxLength(2000) slackWebhookUrl?: string;
  @IsOptional() @IsString() @MaxLength(2000) discordWebhookUrl?: string;
  @IsOptional() @IsObject() events?: Record<string, { enabled: boolean; threshold?: number }>;
}

/** Subscribes to mcp:alert and fans out to Telegram / e-mail / webhooks. */
@Injectable()
export class AlertDispatcherService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AlertDispatcherService.name);

  constructor(
    @InjectRepository(AlertSetting) private readonly settings: Repository<AlertSetting>,
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
    private readonly mail: MailService,
    @Inject(REDIS_SUB) private readonly sub: Redis,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.sub.subscribe(CH_ALERT);
    this.sub.on('message', (channel, raw) => {
      if (channel !== CH_ALERT) return;
      try {
        void this.dispatch(JSON.parse(raw) as AlertEvent);
      } catch (err) {
        this.logger.error(`Alert dispatch failed: ${(err as Error).message}`);
      }
    });
  }

  async getSettings(): Promise<AlertSetting> {
    let row = await this.settings.findOne({ where: {} });
    if (!row) row = await this.settings.save(this.settings.create({}));
    return row;
  }

  async dispatch(alert: AlertEvent): Promise<void> {
    const cfg = await this.getSettings();
    const eventCfg = cfg.events?.[alert.event];
    // store in the panel notification center regardless of transports
    await this.notifications.save(
      this.notifications.create({
        type: alert.event,
        title: alert.title,
        message: alert.message,
        severity: alert.severity,
        meta: alert.meta ?? null,
      }),
    );
    if (eventCfg && eventCfg.enabled === false) return;

    const text = `⚠️ [${alert.severity.toUpperCase()}] ${alert.title}\n${alert.message}`;
    const jobs: Promise<unknown>[] = [];

    if (cfg.telegramEnabled && cfg.telegramBotToken && cfg.telegramChatId) {
      jobs.push(
        fetch(`https://api.telegram.org/bot${cfg.telegramBotToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: cfg.telegramChatId, text }),
          signal: AbortSignal.timeout(10_000),
        }),
      );
    }
    if (cfg.emailEnabled && cfg.emailTo) {
      jobs.push(this.mail.send(cfg.emailTo, `[MCP] ${alert.title}`, `<pre>${alert.message}</pre>`));
    }
    const genericPayload = JSON.stringify({ ...alert, ts: Date.now() });
    if (cfg.webhookEnabled && cfg.webhookUrl) {
      jobs.push(fetch(cfg.webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: genericPayload, signal: AbortSignal.timeout(10_000) }));
    }
    if (cfg.slackWebhookUrl) {
      jobs.push(fetch(cfg.slackWebhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(10_000) }));
    }
    if (cfg.discordWebhookUrl) {
      jobs.push(fetch(cfg.discordWebhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: text }), signal: AbortSignal.timeout(10_000) }));
    }
    const results = await Promise.allSettled(jobs);
    for (const r of results) {
      if (r.status === 'rejected') this.logger.warn(`Alert transport failed: ${r.reason}`);
    }
  }
}

@ApiTags('alerts')
@ApiBearerAuth()
@Controller('alerts')
export class AlertsController {
  constructor(
    private readonly dispatcher: AlertDispatcherService,
    @InjectRepository(AlertSetting) private readonly settings: Repository<AlertSetting>,
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
  ) {}

  @Get('settings')
  @RequirePermissions(PERMISSIONS.ALERTS_MANAGE)
  getSettings() {
    return this.dispatcher.getSettings();
  }

  @Put('settings')
  @RequirePermissions(PERMISSIONS.ALERTS_MANAGE)
  async updateSettings(@Body() dto: UpdateAlertSettingsDto) {
    const current = await this.dispatcher.getSettings();
    return this.settings.save({ ...current, ...dto });
  }

  @Post('test')
  @RequirePermissions(PERMISSIONS.ALERTS_MANAGE)
  @ApiOperation({ summary: 'Send a test alert through all configured transports.' })
  async test() {
    await this.dispatcher.dispatch({
      event: 'test',
      title: 'Test alert',
      message: 'This is a test notification from Multicast Control Panel.',
      severity: 'info',
    });
    return { ok: true };
  }

  @Get('notifications')
  @RequirePermissions(PERMISSIONS.DASHBOARD_VIEW)
  async list(@Query() dto: PaginationDto) {
    const [items, total] = await this.notifications.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (dto.page - 1) * dto.limit,
      take: dto.limit,
    });
    return paginated(items, total, dto);
  }

  @Post('notifications/read-all')
  @RequirePermissions(PERMISSIONS.DASHBOARD_VIEW)
  async readAll() {
    await this.notifications.update({ read: false }, { read: true });
    return { ok: true };
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([AlertSetting, Notification])],
  controllers: [AlertsController],
  providers: [AlertDispatcherService],
  exports: [AlertDispatcherService],
})
export class AlertsModule {}
