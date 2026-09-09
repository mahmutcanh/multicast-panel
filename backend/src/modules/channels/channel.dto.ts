import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsIP,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const SOURCE_TYPES = [
  'file', 'playlist', 'folder', 'm3u8', 'rtsp', 'rtmp', 'http', 'udp',
  'm3u_link', 'camera', 'youtube', 'screen', 'test_pattern',
] as const;

export class ChannelOutputDto {
  @IsOptional() @IsUUID() id?: string;
  @IsIn(['udp', 'hls', 'srt', 'rtmp', 'http']) type: 'udp' | 'hls' | 'srt' | 'rtmp' | 'http';
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() @MaxLength(1000) url?: string;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
  @IsOptional() @IsBoolean() publicEnabled?: boolean;
  @IsOptional() @IsBoolean() tokenRequired?: boolean;
}

export class UpsertChannelDto {
  @IsString() @MaxLength(200) name: string;
  @IsOptional() @IsString() @MaxLength(2000) logoUrl?: string;
  @IsOptional() @IsString() @MaxLength(120) category?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(120) epgId?: string;

  @IsIn(SOURCE_TYPES as unknown as string[]) sourceType: (typeof SOURCE_TYPES)[number];
  @IsOptional() @IsString() @MaxLength(4000) sourceUrl?: string;
  @IsOptional() @IsUUID() playlistId?: string;

  // Multicast range 224.0.0.0–239.255.255.255 not enforced strictly:
  // unicast UDP targets are also legitimate. Must be a valid IPv4.
  @IsIP('4') udpIp: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(65535) udpPort: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(255) ttl?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(188) @Max(65424) pktSize?: number;
  @IsOptional() @IsString() @MaxLength(64) iface?: string;

  @IsOptional() @IsBoolean() copyMode?: boolean;
  @IsOptional() @IsString() @MaxLength(40) videoCodec?: string;
  @IsOptional() @IsString() @MaxLength(40) audioCodec?: string;
  @IsOptional() @Matches(/^\d+[kKmM]?$/) videoBitrate?: string;
  @IsOptional() @Matches(/^\d+[kKmM]?$/) audioBitrate?: string;
  @IsOptional() @Matches(/^(\d+x\d+)?$/) resolution?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(120) fps?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(600) gop?: number;
  @IsOptional() @IsIn(['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow'])
  preset?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(64) threads?: number;
  @IsOptional() @Matches(/^(\d+[kKmM]?)?$/) bufsize?: string;
  @IsOptional() @Matches(/^(\d+[kKmM]?)?$/) muxrate?: string;
  @IsOptional() @IsObject() mpegtsOpts?: Record<string, string>;
  @IsOptional() @IsIn(['', 'vaapi', 'nvenc', 'qsv']) hwaccel?: string;
  @IsOptional() @Matches(/^(\d+[kKmM]?)?$/) probeSize?: string;
  @IsOptional() @Matches(/^(\d+[kKmM]?)?$/) analyzeDuration?: string;
  @IsOptional() @IsObject() reconnectOpts?: { enabled?: boolean; delayMax?: number };
  @IsOptional() @IsString() @MaxLength(2000) extraFfmpegArgs?: string;

  @IsOptional() @IsBoolean() loopMode?: boolean;
  @IsOptional() @IsBoolean() autoStart?: boolean;
  @IsOptional() @IsBoolean() autoRestart?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1000) restartMax?: number;
  @IsOptional() @IsObject() schedule?: { enabled: boolean; startCron?: string; stopCron?: string };
  @IsOptional() @Type(() => Number) @IsInt() priority?: number;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
  @IsOptional() @IsIn(['ffmpeg', 'vlc']) engine?: 'ffmpeg' | 'vlc';
  @IsOptional() @IsUUID() nodeId?: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ChannelOutputDto)
  outputs?: ChannelOutputDto[];
}
