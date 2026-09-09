export interface AppConfig {
  env: string;
  apiPort: number;
  publicUrl: string;
  defaultLocale: string;
  db: { host: string; port: number; name: string; user: string; password: string };
  redis: { host: string; port: number; password: string };
  jwt: {
    secret: string;
    refreshSecret: string;
    accessTtl: number;
    refreshTtl: number;
  };
  streamTokenSecret: string;
  sessionTimeoutMinutes: number;
  ipAllowlist: string[];
  secureCookies: boolean;
  admin: { email: string; password: string; name: string };
  paths: { media: string; hls: string; backups: string };
  ffmpegPath: string;
  ffprobePath: string;
  vlcPath: string;
  multicastInterfaceIp: string;
  hlsBaseUrl: string;
  smtp: {
    host: string;
    port: number;
    user: string;
    password: string;
    from: string;
    secure: boolean;
  };
}

export default (): AppConfig => ({
  env: process.env.NODE_ENV ?? 'production',
  apiPort: parseInt(process.env.API_PORT ?? '3000', 10),
  publicUrl: process.env.PUBLIC_URL ?? 'http://localhost',
  defaultLocale: process.env.DEFAULT_LOCALE ?? 'tr',
  db: {
    host: process.env.DB_HOST ?? 'postgres',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    name: process.env.DB_NAME ?? 'mcp',
    user: process.env.DB_USER ?? 'mcp',
    password: process.env.DB_PASSWORD ?? '',
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'redis',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD ?? '',
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? '',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
    accessTtl: parseInt(process.env.JWT_ACCESS_TTL ?? '900', 10),
    refreshTtl: parseInt(process.env.JWT_REFRESH_TTL ?? '604800', 10),
  },
  streamTokenSecret: process.env.STREAM_TOKEN_SECRET ?? '',
  sessionTimeoutMinutes: parseInt(process.env.SESSION_TIMEOUT_MINUTES ?? '60', 10),
  ipAllowlist: (process.env.IP_ALLOWLIST ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  secureCookies: process.env.SECURE_COOKIES === 'true',
  admin: {
    email: process.env.ADMIN_EMAIL ?? '',
    password: process.env.ADMIN_PASSWORD ?? '',
    name: process.env.ADMIN_NAME ?? 'Administrator',
  },
  paths: {
    media: process.env.MEDIA_DIR ?? '/data/media',
    hls: process.env.HLS_DIR ?? '/data/hls',
    backups: process.env.BACKUP_DIR ?? '/data/backups',
  },
  ffmpegPath: process.env.FFMPEG_PATH ?? '/usr/bin/ffmpeg',
  ffprobePath: process.env.FFPROBE_PATH ?? '/usr/bin/ffprobe',
  vlcPath: process.env.VLC_PATH ?? '/usr/bin/cvlc',
  multicastInterfaceIp: process.env.MULTICAST_INTERFACE_IP ?? '',
  hlsBaseUrl: process.env.HLS_BASE_URL || process.env.PUBLIC_URL || 'http://localhost',
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    user: process.env.SMTP_USER ?? '',
    password: process.env.SMTP_PASSWORD ?? '',
    from: process.env.SMTP_FROM ?? 'panel@example.com',
    secure: process.env.SMTP_SECURE === 'true',
  },
});
