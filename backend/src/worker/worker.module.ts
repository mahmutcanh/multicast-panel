import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from '../config/configuration';
import { RedisModule } from '../common/redis.module';
import { dataSourceOptions } from '../database/data-source';
import { Playlist } from '../database/entities/media.entities';
import { Channel, StreamLog, StreamProcess } from '../database/entities/streaming.entities';
import { MetricsService } from './metrics.service';
import { StreamSupervisorService } from './stream-supervisor.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    TypeOrmModule.forRoot({ ...dataSourceOptions, migrationsRun: false }),
    TypeOrmModule.forFeature([Channel, StreamProcess, StreamLog, Playlist]),
    RedisModule,
  ],
  providers: [StreamSupervisorService, MetricsService],
})
export class WorkerModule {}
