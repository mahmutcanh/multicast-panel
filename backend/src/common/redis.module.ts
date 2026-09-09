import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS = 'REDIS_CLIENT';
export const REDIS_SUB = 'REDIS_SUBSCRIBER';

function createClient(config: ConfigService): Redis {
  return new Redis({
    host: config.get('redis.host'),
    port: config.get('redis.port'),
    password: config.get('redis.password'),
    maxRetriesPerRequest: null,
  });
}

@Global()
@Module({
  providers: [
    { provide: REDIS, useFactory: createClient, inject: [ConfigService] },
    // dedicated connection for pub/sub subscriptions
    { provide: REDIS_SUB, useFactory: createClient, inject: [ConfigService] },
  ],
  exports: [REDIS, REDIS_SUB],
})
export class RedisModule {}
