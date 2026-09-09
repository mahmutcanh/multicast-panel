import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import Redis from 'ioredis';
import { Server, Socket } from 'socket.io';
import { CH_ALERT, CH_LOG, CH_METRICS, CH_STATUS } from '../common/events.service';
import { REDIS_SUB } from '../common/redis.module';

/**
 * Live updates for the panel. Relay only — worker publishes to Redis,
 * this gateway fans out to authenticated Socket.IO clients.
 * Rooms: status, metrics, alerts, logs:<channelId>
 */
@Injectable()
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class EventsGateway implements OnGatewayConnection, OnApplicationBootstrap {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer() server: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(REDIS_SUB) private readonly sub: Redis,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.sub.subscribe(CH_STATUS, CH_LOG, CH_METRICS, CH_ALERT);
    this.sub.on('message', (channel, raw) => {
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(raw);
      } catch {
        return;
      }
      switch (channel) {
        case CH_STATUS:
          this.server.to('status').emit('stream:status', payload);
          break;
        case CH_METRICS:
          this.server.to('metrics').emit('system:metrics', payload);
          break;
        case CH_ALERT:
          this.server.to('alerts').emit('alert', payload);
          break;
        case CH_LOG:
          this.server.to(`logs:${payload.channelId}`).emit('stream:log', payload);
          this.server.to('logs:all').emit('stream:log', payload);
          break;
      }
    });
  }

  async handleConnection(client: Socket): Promise<void> {
    const token =
      (client.handshake.auth?.token as string | undefined) ??
      (client.handshake.headers.authorization ?? '').replace('Bearer ', '');
    try {
      const payload = await this.jwt.verifyAsync(token, { secret: this.config.get('jwt.secret') });
      if (payload.type !== 'access') throw new Error('wrong token type');
      client.data.user = { id: payload.sub, perms: payload.perms ?? [] };
    } catch {
      this.logger.warn(`WS connection rejected (${client.handshake.address})`);
      client.disconnect(true);
    }
  }

  @SubscribeMessage('subscribe')
  onSubscribe(client: Socket, rooms: string[]): void {
    const allowed = /^(status|metrics|alerts|logs:all|logs:[0-9a-f-]{36})$/;
    for (const room of rooms ?? []) {
      if (allowed.test(room)) void client.join(room);
    }
  }

  @SubscribeMessage('unsubscribe')
  onUnsubscribe(client: Socket, rooms: string[]): void {
    for (const room of rooms ?? []) void client.leave(room);
  }
}
