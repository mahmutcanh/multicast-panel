import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Injectable,
  Module,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { Repository } from 'typeorm';
import { PERMISSIONS } from '../../common/permissions';
import { M3uImport } from '../../database/entities/media.entities';
import { Channel, ChannelOutput } from '../../database/entities/streaming.entities';
import { AuthUser, CurrentUser, Public, RequirePermissions } from '../auth/decorators';
import { buildUdpUrl } from '../ffmpeg/ffmpeg-builder';
import { parseM3u, sourceTypeForUrl } from './m3u-parser';

class ImportM3uDto {
  @IsIn(['url', 'content', 'xtream']) source: 'url' | 'content' | 'xtream';
  @IsOptional() @IsString() @MaxLength(2000) url?: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsString() xtreamHost?: string;
  @IsOptional() @IsString() xtreamUser?: string;
  @IsOptional() @IsString() xtreamPass?: string;
  // fill free multicast targets starting from this base
  @IsOptional() @IsString() udpBaseIp?: string;
  @IsOptional() @IsArray() outputTypes?: string[];
}

@Injectable()
export class M3uService {
  constructor(
    @InjectRepository(Channel) private readonly channels: Repository<Channel>,
    @InjectRepository(ChannelOutput) private readonly outputs: Repository<ChannelOutput>,
    @InjectRepository(M3uImport) private readonly imports: Repository<M3uImport>,
    private readonly config: ConfigService,
  ) {}

  async import(dto: ImportM3uDto, userId: string) {
    let content = dto.content ?? '';
    if (dto.source === 'xtream') {
      if (!dto.xtreamHost || !dto.xtreamUser || !dto.xtreamPass) {
        throw new BadRequestException('Xtream IPTV sunucu adresi, kullanıcı adı ve şifresi zorunludur.');
      }
      let host = dto.xtreamHost.trim();
      if (!/^https?:\/\//i.test(host)) host = `http://${host}`;
      host = host.replace(/\/+$/, '');
      dto.url = `${host}/get.php?username=${encodeURIComponent(dto.xtreamUser.trim())}&password=${encodeURIComponent(dto.xtreamPass.trim())}&type=m3u_plus&output=ts`;
      dto.source = 'url';
    }
    if (dto.source === 'url') {
      if (!dto.url) throw new BadRequestException('url required');
      try {
        const res = await fetch(dto.url, {
          signal: AbortSignal.timeout(60_000),
          headers: { 'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18' }
        });
        if (!res.ok) throw new BadRequestException(`IPTV Sunucu Hatası: HTTP ${res.status}`);
        content = await res.text();
      } catch (err: any) {
        if (err instanceof BadRequestException) throw err;
        throw new BadRequestException(`IPTV Sunucusuna Bağlanılamadı (${err?.message || 'Bağlantı zaman aşımı'}). Adres, kullanıcı adı ve şifreyi kontrol edin.`);
      }
    }
    const entries = parseM3u(content);
    if (entries.length === 0) throw new BadRequestException('No channels found in M3U');

    const used = new Set(
      (await this.channels.find()).map((c) => `${c.udpIp}:${c.udpPort}`),
    );
    let [a, b, c, d] = (dto.udpBaseIp ?? '230.121.0.1').split('.').map(Number);
    const nextTarget = (): { ip: string; port: number } => {
      // walk the 230.x.x.x space until a free ip:port is found
      for (;;) {
        const ip = `${a}.${b}.${c}.${d}`;
        if (!used.has(`${ip}:1234`)) {
          used.add(`${ip}:1234`);
          return { ip, port: 1234 };
        }
        d++;
        if (d > 254) { d = 1; c++; }
        if (c > 254) { c = 0; b++; }
      }
    };

    const selectedOutputs = dto.outputTypes && dto.outputTypes.length > 0 ? dto.outputTypes : ['udp', 'hls'];
    let created = 0;
    for (const entry of entries) {
      const target = nextTarget();
      const channel = await this.channels.save(
        this.channels.create({
          name: entry.name,
          logoUrl: entry.logo ?? null,
          category: entry.group ?? 'Imported',
          epgId: entry.epgId ?? '',
          sourceType: sourceTypeForUrl(entry.url) as Channel['sourceType'],
          sourceUrl: entry.url,
          udpIp: target.ip,
          udpPort: target.port,
          copyMode: true,
          autoStart: true,
          autoRestart: true,
        }),
      );
      for (const ot of selectedOutputs) {
        await this.outputs.save(
          this.outputs.create({
            channelId: channel.id,
            type: ot as any,
            enabled: true,
            publicEnabled: true,
            tokenRequired: false,
          }),
        );
      }
      created++;
    }
    return this.imports.save(
      this.imports.create({
        source: dto.source === 'url' ? 'url' : 'file',
        url: dto.url ?? '',
        channelsCreated: created,
        status: 'done',
        createdBy: userId,
      }),
    );
  }

  async exportM3u(): Promise<string> {
    const channels = await this.channels.find({ order: { priority: 'DESC', name: 'ASC' } });
    const base = this.config.get<string>('hlsBaseUrl') || this.config.get<string>('publicUrl') || 'https://stream.homaklab.com';
    const iface = this.config.get<string>('multicastInterfaceIp') ?? '';
    const lines = ['#EXTM3U'];
    for (const ch of channels) {
      const attrs = [
        ch.epgId ? `tvg-id="${ch.epgId}"` : '',
        ch.logoUrl ? `tvg-logo="${ch.logoUrl}"` : '',
        ch.category ? `group-title="${ch.category}"` : '',
      ].filter(Boolean).join(' ');
      const hls = (ch.outputs ?? []).find((o) => o.type === 'hls' && o.enabled);
      // panel M3U points set-top boxes at the UDP multicast address
      const udpUrl = buildUdpUrl(ch, { ffmpegPath: '', hlsDir: '', defaultInterfaceIp: iface }).split('?')[0];
      lines.push(`#EXTINF:-1 ${attrs},${ch.name}`);
      lines.push(udpUrl);
      if (hls) {
        lines.push(`#EXTINF:-1 ${attrs},${ch.name} (HLS)`);
        lines.push(`${base}/hls/${ch.id}/index.m3u8`);
      }
    }
    return lines.join('\n') + '\n';
  }

  async exportJson() {
    return this.channels.find({ order: { name: 'ASC' } });
  }

  async exportCsv(): Promise<string> {
    const channels = await this.channels.find({ order: { name: 'ASC' } });
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = 'name,category,epg_id,source_type,source_url,udp_ip,udp_port,status';
    const rows = channels.map((c) =>
      [c.name, c.category, c.epgId, c.sourceType, c.sourceUrl, c.udpIp, c.udpPort, c.status].map(esc).join(','),
    );
    return [header, ...rows].join('\n') + '\n';
  }

  history() {
    return this.imports.find({ order: { createdAt: 'DESC' }, take: 50 });
  }
}

@ApiTags('m3u')
@ApiBearerAuth()
@Controller('m3u')
export class M3uController {
  constructor(private readonly service: M3uService) {}

  @Post('import')
  @RequirePermissions(PERMISSIONS.M3U_IMPORT)
  @ApiOperation({ summary: 'Import channels from an M3U URL or pasted content.' })
  import(@Body() dto: ImportM3uDto, @CurrentUser() user: AuthUser) {
    return this.service.import(dto, user.id);
  }

  @Get('imports')
  @RequirePermissions(PERMISSIONS.M3U_IMPORT)
  history() {
    return this.service.history();
  }

  @Public()
  @Get('public.m3u')
  @Header('Content-Type', 'audio/x-mpegurl')
  @Header('Content-Disposition', 'inline; filename="iptv-playlist.m3u"')
  async exportPublic() {
    return this.service.exportM3u();
  }

  @Get('export')
  @RequirePermissions(PERMISSIONS.M3U_EXPORT)
  @Header('Content-Type', 'audio/x-mpegurl')
  @Header('Content-Disposition', 'attachment; filename="channels.m3u"')
  async export(@Query('format') format?: string) {
    if (format === 'json') return { __raw: { success: true, data: await this.service.exportJson(), error: null } };
    if (format === 'csv') return this.service.exportCsv();
    return this.service.exportM3u();
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Channel, ChannelOutput, M3uImport])],
  controllers: [M3uController],
  providers: [M3uService],
})
export class M3uModule {}
