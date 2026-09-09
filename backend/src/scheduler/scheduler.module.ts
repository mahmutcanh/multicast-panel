import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsService } from '../common/events.service';
import { RedisModule } from '../common/redis.module';
import configuration from '../config/configuration';
import { dataSourceOptions } from '../database/data-source';
import { SystemSetting } from '../database/entities/ops.entities';
import { Channel, StreamLog } from '../database/entities/streaming.entities';
import { BackupsModule } from '../modules/backups/backups.module';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    TypeOrmModule.forRoot({ ...dataSourceOptions, migrationsRun: false }),
    TypeOrmModule.forFeature([Channel, StreamLog, SystemSetting]),
    ScheduleModule.forRoot(),
    RedisModule,
    BackupsModule,
  ],
  providers: [SchedulerService, EventsService],
})
export class SchedulerAppModule {}
