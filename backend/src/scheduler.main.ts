// Scheduler entrypoint — cron jobs only (scheduled playout, backups, retention).
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { SchedulerAppModule } from './scheduler/scheduler.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(SchedulerAppModule, {
    logger: ['log', 'warn', 'error'],
  });
  app.enableShutdownHooks();
  new Logger('Scheduler').log('Scheduler started.');
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Scheduler failed to start:', err);
  process.exit(1);
});
