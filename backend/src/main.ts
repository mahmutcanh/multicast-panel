// API entrypoint — REST + Swagger + Socket.IO.
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import * as express from 'express';
import { existsSync } from 'fs';
import helmet from 'helmet';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import { StreamTokenService } from './modules/streams/stream-token.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api/v1');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.set('trust proxy', 1);
  app.enableCors({ origin: config.get('publicUrl'), credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidUnknownValues: false }),
  );
  app.enableShutdownHooks();

  // ── Standalone mode (no nginx): serve HLS + SPA straight from the API ──
  // Used for native Windows/simple installs. Docker installs keep nginx.
  const hlsDir = process.env.HLS_DIR ?? config.get<{ hls: string }>('paths')?.hls ?? '';
  if (process.env.SERVE_HLS === 'true' && hlsDir && existsSync(hlsDir)) {
    const tokens = app.get(StreamTokenService);
    const dataSource = app.get(DataSource);
    app.use('/hls/:channelId/:file', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const { channelId, file } = req.params as { channelId: string; file: string };
      if (!/^[0-9a-f-]{36}$/.test(channelId)) return res.status(403).end();
      // Segments (.ts) are served freely: HLS players do not forward the
      // playlist query string to segment requests. The playlist is the gate.
      if (file.endsWith('.m3u8')) {
        const rows = await dataSource.query(
          `SELECT o.public_enabled, o.token_required FROM channel_outputs o
           WHERE o.channel_id = $1 AND o.type = 'hls' AND o.enabled = true LIMIT 1`,
          [channelId],
        );
        if (rows.length === 0) return res.status(403).end();
        const open = rows[0].public_enabled && !rows[0].token_required;
        if (!open && !tokens.verify(String(req.query.token ?? ''), channelId)) {
          return res.status(403).end();
        }
      }
      return next();
    });
    app.use('/hls', express.static(hlsDir, { setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));
  }
  const staticDir = process.env.SERVE_STATIC_DIR ?? '';
  if (staticDir && existsSync(staticDir)) {
    app.use(express.static(staticDir));
    // SPA fallback for panel routes
    app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (
        req.method === 'GET' &&
        !req.path.startsWith('/api') &&
        !req.path.startsWith('/hls') &&
        !req.path.startsWith('/socket.io')
      ) {
        return res.sendFile(path.join(staticDir, 'index.html'));
      }
      return next();
    });
  }

  const swagger = new DocumentBuilder()
    .setTitle('Multicast Control Panel API')
    .setDescription('IPTV UDP multicast streaming control panel — REST API')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger));

  await app.listen(config.get<number>('apiPort') ?? 3000, '0.0.0.0');
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('API failed to start:', err);
  process.exit(1);
});
