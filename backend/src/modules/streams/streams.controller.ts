import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Response } from 'express';
import { Repository } from 'typeorm';
import { EventsService } from '../../common/events.service';
import { PaginationDto, paginated } from '../../common/http.common';
import { PERMISSIONS } from '../../common/permissions';
import {
  Channel,
  StreamLog,
  StreamProcess,
} from '../../database/entities/streaming.entities';
import { Public, RequirePermissions } from '../auth/decorators';
import { StreamTokenService } from './stream-token.service';

@ApiTags('streams')
@Controller('streams')
export class StreamsController {
  constructor(
    @InjectRepository(Channel) private readonly channels: Repository<Channel>,
    @InjectRepository(StreamProcess) private readonly processes: Repository<StreamProcess>,
    @InjectRepository(StreamLog) private readonly logs: Repository<StreamLog>,
    private readonly events: EventsService,
    private readonly tokens: StreamTokenService,
    private readonly config: ConfigService,
  ) {}

  // ── Lifecycle commands (executed by the worker via Redis) ──────────────

  @ApiBearerAuth()
  @Post(':id/start')
  @RequirePermissions(PERMISSIONS.STREAM_START)
  async start(@Param('id', ParseUUIDPipe) id: string) {
    await this.assertChannel(id);
    await this.channels.update(id, { status: 'starting' });
    await this.events.sendCommand({ type: 'start', channelId: id });
    return { ok: true, state: 'starting' };
  }

  @ApiBearerAuth()
  @Post(':id/stop')
  @RequirePermissions(PERMISSIONS.STREAM_STOP)
  @ApiOperation({ summary: 'Graceful stop (SIGTERM, then SIGKILL after timeout).' })
  async stop(@Param('id', ParseUUIDPipe) id: string) {
    await this.assertChannel(id);
    await this.events.sendCommand({ type: 'stop', channelId: id });
    return { ok: true, state: 'stopping' };
  }

  @ApiBearerAuth()
  @Post(':id/kill')
  @RequirePermissions(PERMISSIONS.STREAM_STOP)
  @ApiOperation({ summary: 'Force kill (SIGKILL immediately).' })
  async kill(@Param('id', ParseUUIDPipe) id: string) {
    await this.assertChannel(id);
    await this.events.sendCommand({ type: 'kill', channelId: id });
    return { ok: true, state: 'killing' };
  }

  @ApiBearerAuth()
  @Post(':id/restart')
  @RequirePermissions(PERMISSIONS.STREAM_RESTART)
  async restart(@Param('id', ParseUUIDPipe) id: string) {
    await this.assertChannel(id);
    await this.events.sendCommand({ type: 'restart', channelId: id });
    return { ok: true, state: 'restarting' };
  }

  // ── Status & logs ──────────────────────────────────────────────────────

  @ApiBearerAuth()
  @Get('status')
  @RequirePermissions(PERMISSIONS.STREAM_VIEW)
  async statusAll() {
    return this.processes.find();
  }

  @ApiBearerAuth()
  @Get(':id/status')
  @RequirePermissions(PERMISSIONS.STREAM_VIEW)
  async status(@Param('id', ParseUUIDPipe) id: string) {
    await this.assertChannel(id);
    return (await this.processes.findOne({ where: { channelId: id } })) ?? { state: 'stopped' };
  }

  @ApiBearerAuth()
  @Get(':id/logs')
  @RequirePermissions(PERMISSIONS.STREAM_VIEW)
  async channelLogs(@Param('id', ParseUUIDPipe) id: string, @Query() dto: PaginationDto) {
    const [items, total] = await this.logs.findAndCount({
      where: { channelId: id },
      order: { createdAt: 'DESC' },
      skip: (dto.page - 1) * dto.limit,
      take: dto.limit,
    });
    return paginated(items, total, dto);
  }

  // ── External links ─────────────────────────────────────────────────────

  @ApiBearerAuth()
  @Get(':id/external-link')
  @RequirePermissions(PERMISSIONS.STREAM_VIEW)
  @ApiOperation({ summary: 'Tokenized temporary HLS link for external viewers.' })
  async externalLink(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('ttl') ttl?: string,
  ) {
    const channel = await this.assertChannel(id);
    const hls = (channel.outputs ?? []).find((o) => o.type === 'hls' && o.enabled);
    if (!hls) throw new BadRequestException('HLS output is not enabled for this channel');
    const ttlSeconds = Math.min(parseInt(ttl ?? '86400', 10) || 86400, 30 * 86400);
    const base = this.config.get<string>('hlsBaseUrl');
    const url = `${base}/hls/${id}/index.m3u8`;
    if (hls.publicEnabled && !hls.tokenRequired) return { url, tokenized: false };
    const token = this.tokens.sign(id, ttlSeconds);
    return { url: `${url}?token=${token}`, tokenized: true, expiresInSeconds: ttlSeconds };
  }

  /** nginx auth_request target for /hls/<channelId>/... */
  @Public()
  @Get('hls-auth')
  @Header('Cache-Control', 'no-store')
  async hlsAuth(
    @Headers('x-original-uri') originalUri: string | undefined,
    @Res() res: Response,
  ) {
    const match = /^\/hls\/([0-9a-f-]{36})\//.exec(originalUri ?? '');
    if (!match) return res.status(403).end();
    const channelId = match[1];
    const channel = await this.channels.findOne({ where: { id: channelId } });
    const hls = channel?.outputs?.find((o) => o.type === 'hls' && o.enabled);
    if (!channel || !hls) return res.status(403).end();
    if (hls.publicEnabled && !hls.tokenRequired) return res.status(200).end();
    const token = new URL(`http://x${originalUri}`).searchParams.get('token') ?? '';
    return res.status(this.tokens.verify(token, channelId) ? 200 : 403).end();
  }

  private async assertChannel(id: string): Promise<Channel> {
    const channel = await this.channels.findOne({ where: { id } });
    if (!channel) throw new BadRequestException('Channel not found');
    return channel;
  }
}
