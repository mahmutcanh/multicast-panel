import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS } from './redis.module';

// Redis pub/sub channels shared by api / worker / scheduler.
export const CH_CMD = 'mcp:cmd'; // api/scheduler → worker : stream commands
export const CH_STATUS = 'mcp:status'; // worker → api : stream state changes
export const CH_LOG = 'mcp:log'; // worker → api : ffmpeg log lines
export const CH_METRICS = 'mcp:metrics'; // worker → api : system metrics samples
export const CH_ALERT = 'mcp:alert'; // any → api : alert events

export interface StreamCommand {
  type: 'start' | 'stop' | 'restart' | 'kill';
  channelId: string;
}

export interface AlertEvent {
  event: string; // stream_offline | ffmpeg_crash | auto_restart | high_cpu | ...
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  meta?: Record<string, unknown>;
}

@Injectable()
export class EventsService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async publish(channel: string, payload: unknown): Promise<void> {
    await this.redis.publish(channel, JSON.stringify(payload));
  }

  async sendCommand(cmd: StreamCommand): Promise<void> {
    await this.publish(CH_CMD, cmd);
  }

  async raiseAlert(alert: AlertEvent): Promise<void> {
    await this.publish(CH_ALERT, alert);
  }
}
