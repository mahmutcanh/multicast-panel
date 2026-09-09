import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from './config/configuration';
import { EnvelopeInterceptor, GlobalExceptionFilter } from './common/http.common';
import { RedisModule } from './common/redis.module';
import { dataSourceOptions } from './database/data-source';
import { SeedService } from './database/seed.service';
import { AuditInterceptor } from './modules/audit/audit.interceptor';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuthGuard, IpAllowlistGuard, PermissionsGuard } from './modules/auth/guards';
import { ApiTokensModule } from './modules/api-tokens/api-tokens.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { BackupsModule } from './modules/backups/backups.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { EpgModule } from './modules/epg/epg.module';
import { InstallerModule } from './modules/installer/installer.module';
import { LibraryModule } from './modules/library/library.module';
import { LicenseModule } from './modules/license/license.module';
import { LogsModule } from './modules/logs/logs.module';
import { M3uModule } from './modules/m3u/m3u.module';
import { MonitoringModule } from './modules/monitoring/monitoring.module';
import { NodesModule } from './modules/nodes/nodes.module';
import { PlaylistsModule } from './modules/playlists/playlists.module';
import { SettingsModule } from './modules/settings/settings.module';
import { StreamsModule } from './modules/streams/streams.module';
import { UsersModule } from './modules/users/users.module';
import { EventsGateway } from './websocket/events.gateway';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    TypeOrmModule.forRoot({
      ...dataSourceOptions,
      migrationsRun: process.env.RUN_MIGRATIONS !== 'false',
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    RedisModule,
    AuthModule,
    AuditModule,
    UsersModule,
    ApiTokensModule,
    ChannelsModule,
    StreamsModule,
    LibraryModule,
    PlaylistsModule,
    M3uModule,
    EpgModule,
    MonitoringModule,
    LogsModule,
    AlertsModule,
    BackupsModule,
    LicenseModule,
    SettingsModule,
    InstallerModule,
    NodesModule,
  ],
  providers: [
    SeedService,
    EventsGateway,
    { provide: APP_GUARD, useClass: IpAllowlistGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: EnvelopeInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule implements OnApplicationBootstrap {
  constructor(private readonly seeder: SeedService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seeder.run();
  }
}
