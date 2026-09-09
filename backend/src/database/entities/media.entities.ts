import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('video_files')
export class VideoFile {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() filename: string;
  @Index({ unique: true })
  @Column({ type: 'text' })
  path: string;
  @Column({ name: 'size_bytes', type: 'bigint', default: 0 }) sizeBytes: string;
  @Column({ name: 'duration_seconds', type: 'float', default: 0 }) durationSeconds: number;
  @Column({ name: 'video_codec', default: '' }) videoCodec: string;
  @Column({ name: 'audio_codec', default: '' }) audioCodec: string;
  @Column({ default: '' }) resolution: string;
  @Column({ type: 'float', default: 0 }) fps: number;
  @Column({ name: 'bitrate_kbps', type: 'float', default: 0 }) bitrateKbps: number;
  @Column({ name: 'thumbnail_path', type: 'text', nullable: true }) thumbnailPath: string | null;
  @Column({ type: 'jsonb', default: () => `'[]'` }) tags: string[];
  @Column({ default: '' }) category: string;
  @Column({ name: 'uploaded_by', type: 'uuid', nullable: true }) uploadedBy: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}

export type PlaylistMode = 'sequential' | 'random' | 'single_loop' | 'folder_loop' | 'scheduled';

@Entity('playlists')
export class Playlist {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() name: string;
  @Column({ default: 'sequential' }) mode: PlaylistMode;
  // used by folder_loop mode
  @Column({ name: 'folder_path', type: 'text', default: '' }) folderPath: string;
  @Column({ default: true }) loop: boolean;
  // time-based playout: [{ start: "HH:mm", videoFileId | url }]
  @Column({ type: 'jsonb', nullable: true }) schedule: unknown | null;
  @OneToMany(() => PlaylistItem, (i) => i.playlist, { eager: true, cascade: true })
  items: PlaylistItem[];
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}

@Entity('playlist_items')
export class PlaylistItem {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'playlist_id' }) playlistId: string;
  @ManyToOne(() => Playlist, (p) => p.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'playlist_id' })
  playlist: Playlist;
  @Column({ name: 'video_file_id', type: 'uuid', nullable: true }) videoFileId: string | null;
  @ManyToOne(() => VideoFile, { nullable: true, eager: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'video_file_id' })
  videoFile: VideoFile | null;
  @Column({ type: 'text', default: '' }) url: string;
  @Column({ default: 0 }) position: number;
}

@Entity('epg_channels')
export class EpgChannel {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index({ unique: true })
  @Column({ name: 'epg_id' })
  epgId: string;
  @Column() name: string;
  @Column({ type: 'text', nullable: true }) icon: string | null;
  @Column({ name: 'channel_id', type: 'uuid', nullable: true }) channelId: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

@Entity('epg_programs')
export class EpgProgram {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index()
  @Column({ name: 'epg_channel_id' })
  epgChannelId: string;
  @ManyToOne(() => EpgChannel, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'epg_channel_id' })
  epgChannel: EpgChannel;
  @Column() title: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ name: 'start_at', type: 'timestamptz' }) startAt: Date;
  @Column({ name: 'end_at', type: 'timestamptz' }) endAt: Date;
  @Column({ default: '' }) category: string;
}

@Entity('m3u_imports')
export class M3uImport {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ default: 'url' }) source: 'url' | 'file';
  @Column({ type: 'text', default: '' }) url: string;
  @Column({ default: '' }) filename: string;
  @Column({ name: 'channels_created', default: 0 }) channelsCreated: number;
  @Column({ default: 'done' }) status: 'done' | 'failed';
  @Column({ type: 'text', nullable: true }) error: string | null;
  @Column({ name: 'created_by', type: 'uuid', nullable: true }) createdBy: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
