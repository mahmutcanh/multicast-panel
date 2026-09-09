import {
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Repository } from 'typeorm';
import { EventsService } from '../../common/events.service';
import { PaginationDto, paginated } from '../../common/http.common';
import { PERMISSIONS } from '../../common/permissions';
import { RedisModule } from '../../common/redis.module';
import { Playlist, PlaylistItem } from '../../database/entities/media.entities';
import { Channel } from '../../database/entities/streaming.entities';
import { RequirePermissions } from '../auth/decorators';

class PlaylistItemDto {
  @IsOptional() @IsUUID() videoFileId?: string;
  @IsOptional() @IsString() @MaxLength(2000) url?: string;
  @Type(() => Number) @IsInt() @Min(0) position: number;
}

class UpsertPlaylistDto {
  @IsString() @MaxLength(200) name: string;
  @IsIn(['sequential', 'random', 'single_loop', 'folder_loop', 'scheduled'])
  mode: Playlist['mode'];
  @IsOptional() @IsString() @MaxLength(1000) folderPath?: string;
  @IsOptional() @IsBoolean() loop?: boolean;
  @IsOptional() @IsObject() schedule?: unknown;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PlaylistItemDto)
  items?: PlaylistItemDto[];
}

@Injectable()
export class PlaylistsService {
  constructor(
    @InjectRepository(Playlist) private readonly playlists: Repository<Playlist>,
    @InjectRepository(PlaylistItem) private readonly items: Repository<PlaylistItem>,
    @InjectRepository(Channel) private readonly channels: Repository<Channel>,
    private readonly events: EventsService,
  ) {}

  async list(page: number, limit: number, search?: string) {
    const qb = this.playlists.createQueryBuilder('p')
      .leftJoinAndSelect('p.items', 'items')
      .leftJoinAndSelect('items.videoFile', 'video')
      .orderBy('p.name', 'ASC');
    if (search) qb.where('p.name ILIKE :s', { s: `%${search}%` });
    const [items, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
    return { items, total };
  }

  async get(id: string): Promise<Playlist> {
    const playlist = await this.playlists.findOne({ where: { id } });
    if (!playlist) throw new NotFoundException('Playlist not found');
    playlist.items?.sort((a, b) => a.position - b.position);
    return playlist;
  }

  async create(dto: UpsertPlaylistDto): Promise<Playlist> {
    const { items, ...fields } = dto;
    const playlist = await this.playlists.save(this.playlists.create(fields as Partial<Playlist>));
    await this.saveItems(playlist.id, items);
    return this.get(playlist.id);
  }

  async update(id: string, dto: UpsertPlaylistDto): Promise<Playlist> {
    const playlist = await this.get(id);
    const { items, ...fields } = dto;
    await this.playlists.save({ ...playlist, ...fields, items: undefined });
    if (items) {
      await this.items.delete({ playlistId: id });
      await this.saveItems(id, items);
    }
    const result = await this.get(id);
    void this.restartChannelsUsing(id);
    return result;
  }

  private async restartChannelsUsing(playlistId: string): Promise<void> {
    const running = await this.channels.find({ where: { playlistId, status: 'running' } });
    for (const ch of running) {
      await this.events.sendCommand({ type: 'restart', channelId: ch.id });
    }
  }

  async remove(id: string): Promise<void> {
    await this.playlists.remove(await this.get(id));
  }

  /** Resolved play order — used by the playlist preview screen. */
  async preview(id: string): Promise<{ position: number; title: string; source: string; durationSeconds: number }[]> {
    const playlist = await this.get(id);
    return (playlist.items ?? []).map((i) => ({
      position: i.position,
      title: i.videoFile?.filename ?? i.url,
      source: i.videoFile?.path ?? i.url,
      durationSeconds: i.videoFile?.durationSeconds ?? 0,
    }));
  }

  private async saveItems(playlistId: string, items?: PlaylistItemDto[]): Promise<void> {
    for (const item of items ?? []) {
      await this.items.save(
        this.items.create({
          playlistId,
          videoFileId: item.videoFileId ?? null,
          url: item.url ?? '',
          position: item.position,
        }),
      );
    }
  }
}

@ApiTags('playlists')
@ApiBearerAuth()
@Controller('playlists')
export class PlaylistsController {
  constructor(private readonly service: PlaylistsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PLAYLIST_VIEW)
  async list(@Query() dto: PaginationDto) {
    const { items, total } = await this.service.list(dto.page, dto.limit, dto.search);
    return paginated(items, total, dto);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PLAYLIST_VIEW)
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(id);
  }

  @Get(':id/preview')
  @RequirePermissions(PERMISSIONS.PLAYLIST_VIEW)
  preview(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.preview(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PLAYLIST_CREATE)
  create(@Body() dto: UpsertPlaylistDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @RequirePermissions(PERMISSIONS.PLAYLIST_EDIT)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpsertPlaylistDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.PLAYLIST_DELETE)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.service.remove(id);
    return { ok: true };
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Playlist, PlaylistItem, Channel]), RedisModule],
  controllers: [PlaylistsController],
  providers: [PlaylistsService, EventsService],
  exports: [PlaylistsService],
})
export class PlaylistsModule {}
