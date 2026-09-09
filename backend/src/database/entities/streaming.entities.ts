import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type SourceType =
  | 'file'
  | 'playlist'
  | 'folder'
  | 'm3u8'
  | 'rtsp'
  | 'rtmp'
  | 'http'
  | 'udp'
  | 'm3u_link'
  | 'camera'
  | 'youtube'
  | 'screen'
  | 'test_pattern';

export type OutputType = 'udp' | 'hls' | 'srt' | 'rtmp' | 'http';
export type StreamState = 'stopped' | 'starting' | 'running' | 'restarting' | 'crashed' | 'error';

@Entity('nodes')
export class StreamingNode {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) name: string;
  @Column({ default: '127.0.0.1' }) host: string;
  // v1: single 'local' node. Remote nodes reserved for cluster mode.
  @Column({ default: 'local' }) role: 'local' | 'remote';
  @Column({ default: 'online' }) status: string;
  @Column({ name: 'last_seen_at', type: 'timestamptz', nullable: true }) lastSeenAt: Date | null;
  @Column({ type: 'jsonb', nullable: true }) meta: Record<string, unknown> | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

@Entity('channels')
export class Channel {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() name: string;
  @Column({ name: 'logo_url', type: 'text', nullable: true }) logoUrl: string | null;
  @Column({ nullable: true }) category: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ name: 'epg_id', nullable: true }) epgId: string;

  @Column({ name: 'source_type', default: 'test_pattern' }) sourceType: SourceType;
  @Column({ name: 'source_url', type: 'text', nullable: true }) sourceUrl: string | null;
  @Column({ name: 'playlist_id', type: 'uuid', nullable: true }) playlistId: string | null;

  // ── UDP multicast output basics ──
  @Column({ name: 'udp_ip', default: '230.120.5.98' }) udpIp: string;
  @Column({ name: 'udp_port', default: 1234 }) udpPort: number;
  @Column({ default: 64 }) ttl: number;
  @Column({ name: 'pkt_size', default: 1316 }) pktSize: number;
  // Local interface IP for multicast egress (empty = system default / env)
  @Column({ name: 'iface', default: '' }) iface: string;

  // ── Encoding ──
  @Column({ name: 'copy_mode', default: true }) copyMode: boolean;
  @Column({ name: 'video_codec', default: 'libx264' }) videoCodec: string;
  @Column({ name: 'audio_codec', default: 'aac' }) audioCodec: string;
  @Column({ name: 'video_bitrate', default: '4000k' }) videoBitrate: string;
  @Column({ name: 'audio_bitrate', default: '128k' }) audioBitrate: string;
  @Column({ default: '' }) resolution: string; // e.g. 1920x1080, empty = keep
  @Column({ default: 0 }) fps: number; // 0 = keep
  @Column({ default: 50 }) gop: number;
  @Column({ default: 'veryfast' }) preset: string;
  @Column({ default: 0 }) threads: number; // 0 = auto
  @Column({ default: '' }) bufsize: string;
  @Column({ default: '' }) muxrate: string;
  @Column({ name: 'mpegts_opts', type: 'jsonb', nullable: true })
  mpegtsOpts: Record<string, string> | null;
  @Column({ default: '' }) hwaccel: string; // '', 'vaapi', 'nvenc' (readiness)
  @Column({ name: 'probe_size', default: '' }) probeSize: string;
  @Column({ name: 'analyze_duration', default: '' }) analyzeDuration: string;
  @Column({ name: 'reconnect_opts', type: 'jsonb', nullable: true })
  reconnectOpts: { enabled?: boolean; delayMax?: number } | null;
  @Column({ name: 'extra_ffmpeg_args', type: 'text', default: '' }) extraFfmpegArgs: string;

  // ── Behaviour ──
  @Column({ name: 'loop_mode', default: true }) loopMode: boolean;
  @Column({ name: 'auto_start', default: false }) autoStart: boolean;
  @Column({ name: 'auto_restart', default: true }) autoRestart: boolean;
  @Column({ name: 'restart_max', default: 10 }) restartMax: number;
  @Column({ type: 'jsonb', nullable: true })
  schedule: { enabled: boolean; startCron?: string; stopCron?: string } | null;
  @Column({ default: 0 }) priority: number;
  @Column({ type: 'text', nullable: true }) notes: string | null;
  @Column({ default: 'ffmpeg' }) engine: 'ffmpeg' | 'vlc';
  @Column({ default: 'stopped' }) status: StreamState;

  @Column({ name: 'node_id', type: 'uuid', nullable: true }) nodeId: string | null;
  @ManyToOne(() => StreamingNode, { nullable: true })
  @JoinColumn({ name: 'node_id' })
  node: StreamingNode | null;

  @OneToMany(() => ChannelOutput, (o) => o.channel, { eager: true, cascade: true })
  outputs: ChannelOutput[];

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}

@Entity('channel_outputs')
export class ChannelOutput {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'channel_id' }) channelId: string;
  @ManyToOne(() => Channel, (c) => c.outputs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'channel_id' })
  channel: Channel;
  @Column() type: OutputType;
  @Column({ default: true }) enabled: boolean;
  // srt/rtmp target url; hls uses server path; udp built from channel fields
  @Column({ type: 'text', default: '' }) url: string;
  // per-output overrides: { bitrate, resolution, quality, segmentTime, listSize ... }
  @Column({ type: 'jsonb', default: () => `'{}'` }) config: Record<string, unknown>;
  @Column({ name: 'public_enabled', default: false }) publicEnabled: boolean;
  @Column({ name: 'token_required', default: true }) tokenRequired: boolean;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

@Entity('stream_processes')
export class StreamProcess {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index({ unique: true })
  @Column({ name: 'channel_id' })
  channelId: string;
  @OneToOne(() => Channel, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'channel_id' })
  channel: Channel;
  @Column({ type: 'int', nullable: true }) pid: number | null;
  @Column({ default: 'stopped' }) state: StreamState;
  @Column({ name: 'started_at', type: 'timestamptz', nullable: true }) startedAt: Date | null;
  @Column({ name: 'stopped_at', type: 'timestamptz', nullable: true }) stoppedAt: Date | null;
  @Column({ name: 'restart_count', default: 0 }) restartCount: number;
  @Column({ name: 'last_error', type: 'text', nullable: true }) lastError: string | null;
  @Column({ name: 'last_error_at', type: 'timestamptz', nullable: true }) lastErrorAt: Date | null;
  @Column({ name: 'bitrate_kbps', type: 'float', default: 0 }) bitrateKbps: number;
  @Column({ type: 'float', default: 0 }) fps: number;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}

@Entity('stream_logs')
export class StreamLog {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index()
  @Column({ name: 'channel_id', type: 'uuid', nullable: true })
  channelId: string | null;
  @Column({ default: 'info' }) level: 'debug' | 'info' | 'warn' | 'error';
  @Column({ default: 'ffmpeg' }) source: string;
  @Column({ type: 'text' }) message: string;
  @Index()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
