/**
 * E2E smoke tests — require a running PostgreSQL/Redis (docker compose stack).
 * Enable with: MCP_E2E=1 npm run test:e2e
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

const enabled = process.env.MCP_E2E === '1';
const d = enabled ? describe : describe.skip;

d('API smoke (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // imported lazily so the skipped suite never touches DB config
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/v1/system/health → ok', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/system/health').expect(200);
    expect(res.body.data.status).toBeDefined();
  });

  it('GET /api/v1/channels without token → 401', async () => {
    await request(app.getHttpServer()).get('/api/v1/channels').expect(401);
  });

  it('POST /api/v1/auth/login with bad credentials → 401', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong-password' })
      .expect(401);
  });

  it('GET /api/v1/installer/status → public', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/installer/status').expect(200);
    expect(typeof res.body.data.installed).toBe('boolean');
  });
});
