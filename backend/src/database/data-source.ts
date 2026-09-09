import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { ALL_ENTITIES } from './entities';
import { InitialSchema1700000000000 } from './migrations/1700000000000-InitialSchema';

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST ?? 'postgres',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USER ?? 'mcp',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'mcp',
  entities: ALL_ENTITIES,
  migrations: [InitialSchema1700000000000],
  synchronize: false,
  logging: false,
};

export default new DataSource(dataSourceOptions);
