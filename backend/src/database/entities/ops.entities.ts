import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('system_settings')
export class SystemSetting {
  @PrimaryColumn() key: string;
  @Column({ type: 'jsonb', nullable: true }) value: unknown;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}

export interface AlertEventConfig {
  enabled: boolean;
  threshold?: number;
}

@Entity('alert_settings')
export class AlertSetting {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'telegram_enabled', default: false }) telegramEnabled: boolean;
  @Column({ name: 'telegram_bot_token', default: '' }) telegramBotToken: string;
  @Column({ name: 'telegram_chat_id', default: '' }) telegramChatId: string;
  @Column({ name: 'email_enabled', default: false }) emailEnabled: boolean;
  @Column({ name: 'email_to', default: '' }) emailTo: string;
  @Column({ name: 'webhook_enabled', default: false }) webhookEnabled: boolean;
  @Column({ name: 'webhook_url', type: 'text', default: '' }) webhookUrl: string;
  @Column({ name: 'slack_webhook_url', type: 'text', default: '' }) slackWebhookUrl: string;
  @Column({ name: 'discord_webhook_url', type: 'text', default: '' }) discordWebhookUrl: string;
  // keyed by event name: stream_offline, ffmpeg_crash, auto_restart, high_cpu,
  // high_ram, low_disk, bitrate_drop, login_failures, backup_failure
  @Column({ type: 'jsonb', default: () => `'{}'` })
  events: Record<string, AlertEventConfig>;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() type: string;
  @Column() title: string;
  @Column({ type: 'text' }) message: string;
  @Column({ default: 'info' }) severity: 'info' | 'warning' | 'critical';
  @Column({ default: false }) read: boolean;
  @Column({ type: 'jsonb', nullable: true }) meta: Record<string, unknown> | null;
  @Index()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

@Entity('backups')
export class Backup {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() filename: string;
  @Column({ type: 'text' }) path: string;
  @Column({ name: 'size_bytes', type: 'bigint', default: 0 }) sizeBytes: string;
  @Column({ default: 'manual' }) type: 'manual' | 'auto';
  @Column({ default: 'done' }) status: 'running' | 'done' | 'failed';
  @Column({ type: 'text', nullable: true }) error: string | null;
  @Column({ name: 'created_by', type: 'uuid', nullable: true }) createdBy: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

@Entity('licenses')
export class License {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'license_key', type: 'text', default: '' }) licenseKey: string;
  @Column({ default: 'trial' }) status: 'trial' | 'active' | 'expired' | 'grace' | 'invalid';
  @Column({ name: 'licensed_to', default: '' }) licensedTo: string;
  @Column({ type: 'jsonb', default: () => `'{}'` }) features: Record<string, boolean | number>;
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true }) expiresAt: Date | null;
  @Column({ name: 'grace_days', default: 7 }) graceDays: number;
  // offline: key validated locally; online reserved for future validation service
  @Column({ default: 'offline' }) mode: 'offline' | 'online';
  @Column({ name: 'activated_at', type: 'timestamptz', nullable: true }) activatedAt: Date | null;
  @Column({ name: 'last_validated_at', type: 'timestamptz', nullable: true })
  lastValidatedAt: Date | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
