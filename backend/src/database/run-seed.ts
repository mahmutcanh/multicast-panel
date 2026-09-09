// Standalone seed runner: npm run seed
import 'reflect-metadata';
import dataSource from './data-source';
import { SeedService } from './seed.service';
import { ConfigService } from '@nestjs/config';
import configuration from '../config/configuration';

async function main(): Promise<void> {
  await dataSource.initialize();
  await dataSource.runMigrations();
  const config = new ConfigService(configuration());
  const seeder = new SeedService(dataSource, config);
  await seeder.run();
  await dataSource.destroy();
  // eslint-disable-next-line no-console
  console.log('Seed complete.');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Seed failed:', err);
  process.exit(1);
});
