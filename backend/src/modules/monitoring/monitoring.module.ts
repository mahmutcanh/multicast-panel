import { Controller, Get, Inject, Module } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { Repository } from 'typeorm';
import { PERMISSIONS } from '../../common/permissions';
import { REDIS } from '../../common/redis.module';
import { Channel, StreamProcess } from '../../database/entities/streaming.entities';
import { Public, RequirePermissions } from '../auth/decorators';

@ApiTags('system')
@Controller('system')
export class MonitoringController {
  constructor(
    @InjectRepository(Channel) private readonly channels: Repository<Channel>,
    @InjectRepository(StreamProcess) private readonly processes: Repository<StreamProcess>,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Liveness probe — used by nginx, installer and HA watchdogs. */
  @Public()
  @Get('health')
  async health() {
    let redisOk = false;
    try {
      redisOk = (await this.redis.ping()) === 'PONG';
    } catch {
      redisOk = false;
    }
    let dbOk = false;
    try {
      await this.channels.query('SELECT 1');
      dbOk = true;
    } catch {
      dbOk = false;
    }
    return { status: dbOk && redisOk ? 'ok' : 'degraded', db: dbOk, redis: redisOk, ts: Date.now() };
  }

  /** Dashboard aggregate: host metrics + stream totals. */
  @ApiBearerAuth()
  @Get('stats')
  @RequirePermissions(PERMISSIONS.DASHBOARD_VIEW)
  async stats() {
    const metricsRaw = await this.redis.get('mcp:metrics:last');
    const processes = await this.processes.find();
    const running = processes.filter((p) => p.state === 'running');
    return {
      metrics: metricsRaw ? JSON.parse(metricsRaw) : null,
      totals: {
        channels: await this.channels.count(),
        activeStreams: running.length,
        totalBitrateKbps: Math.round(running.reduce((acc, p) => acc + p.bitrateKbps, 0)),
        crashed: processes.filter((p) => p.state === 'crashed').length,
        restartsTotal: processes.reduce((acc, p) => acc + p.restartCount, 0),
      },
      processes,
    };
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Channel, StreamProcess])],
  controllers: [MonitoringController],
})
export class MonitoringModule {}
