import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Between, Repository } from 'typeorm';
import { PERMISSIONS } from '../../common/permissions';
import { EpgChannel, EpgProgram } from '../../database/entities/media.entities';
import { RequirePermissions } from '../auth/decorators';

class UpsertEpgChannelDto {
  @IsString() @MaxLength(120) epgId: string;
  @IsString() @MaxLength(200) name: string;
  @IsOptional() @IsString() @MaxLength(2000) icon?: string;
  @IsOptional() @IsUUID() channelId?: string;
}

class ImportXmltvDto {
  @IsIn(['url', 'content']) source: 'url' | 'content';
  @IsOptional() @IsString() @MaxLength(2000) url?: string;
  @IsOptional() @IsString() content?: string;
}

/** Minimal XMLTV parsing — enough for channel + programme basics (v1). */
function parseXmltvDate(value: string): Date {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-]\d{4}))?/.exec(value);
  if (!m) return new Date(NaN);
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] ? `${m[7].slice(0, 3)}:${m[7].slice(3)}` : 'Z'}`;
  return new Date(iso);
}

@Injectable()
export class EpgService {
  constructor(
    @InjectRepository(EpgChannel) private readonly channels: Repository<EpgChannel>,
    @InjectRepository(EpgProgram) private readonly programs: Repository<EpgProgram>,
  ) {}

  listChannels() {
    return this.channels.find({ order: { name: 'ASC' } });
  }

  async upsertChannel(dto: UpsertEpgChannelDto): Promise<EpgChannel> {
    const existing = await this.channels.findOne({ where: { epgId: dto.epgId } });
    return this.channels.save(this.channels.create({ ...(existing ?? {}), ...dto }));
  }

  async removeChannel(id: string): Promise<void> {
    await this.channels.delete(id);
  }

  async programsFor(epgChannelId: string, from: Date, to: Date) {
    return this.programs.find({
      where: { epgChannelId, startAt: Between(from, to) },
      order: { startAt: 'ASC' },
    });
  }

  async importXmltv(dto: ImportXmltvDto): Promise<{ channels: number; programs: number }> {
    let xml = dto.content ?? '';
    if (dto.source === 'url') {
      if (!dto.url) throw new BadRequestException('url required');
      const res = await fetch(dto.url, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new BadRequestException(`Fetch failed: HTTP ${res.status}`);
      xml = await res.text();
    }

    let channelCount = 0;
    for (const m of xml.matchAll(/<channel\s+id="([^"]+)"[\s\S]*?<display-name[^>]*>([^<]*)<\/display-name>[\s\S]*?<\/channel>/g)) {
      await this.upsertChannel({ epgId: m[1], name: m[2] });
      channelCount++;
    }

    const byEpgId = new Map((await this.channels.find()).map((c) => [c.epgId, c.id]));
    let programCount = 0;
    for (const m of xml.matchAll(/<programme\s+start="([^"]+)"\s+stop="([^"]+)"\s+channel="([^"]+)"[^>]*>([\s\S]*?)<\/programme>/g)) {
      const epgChannelId = byEpgId.get(m[3]);
      if (!epgChannelId) continue;
      const title = /<title[^>]*>([^<]*)<\/title>/.exec(m[4])?.[1] ?? 'Unknown';
      const desc = /<desc[^>]*>([^<]*)<\/desc>/.exec(m[4])?.[1] ?? null;
      const startAt = parseXmltvDate(m[1]);
      const endAt = parseXmltvDate(m[2]);
      if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) continue;
      await this.programs.save(
        this.programs.create({ epgChannelId, title, description: desc, startAt, endAt }),
      );
      programCount++;
    }
    return { channels: channelCount, programs: programCount };
  }
}

@ApiTags('epg')
@ApiBearerAuth()
@Controller('epg')
export class EpgController {
  constructor(private readonly service: EpgService) {}

  @Get('channels')
  @RequirePermissions(PERMISSIONS.EPG_VIEW)
  channels() {
    return this.service.listChannels();
  }

  @Post('channels')
  @RequirePermissions(PERMISSIONS.EPG_MANAGE)
  upsert(@Body() dto: UpsertEpgChannelDto) {
    return this.service.upsertChannel(dto);
  }

  @Delete('channels/:id')
  @RequirePermissions(PERMISSIONS.EPG_MANAGE)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.service.removeChannel(id);
    return { ok: true };
  }

  @Get('channels/:id/programs')
  @RequirePermissions(PERMISSIONS.EPG_VIEW)
  programs(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const fromDate = from ? new Date(from) : new Date();
    const toDate = to ? new Date(to) : new Date(Date.now() + 86_400_000);
    return this.service.programsFor(id, fromDate, toDate);
  }

  @Post('import')
  @RequirePermissions(PERMISSIONS.EPG_MANAGE)
  @ApiOperation({ summary: 'Import XMLTV from URL or pasted content.' })
  import(@Body() dto: ImportXmltvDto) {
    return this.service.importXmltv(dto);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([EpgChannel, EpgProgram])],
  controllers: [EpgController],
  providers: [EpgService],
})
export class EpgModule {}
