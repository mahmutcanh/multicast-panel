// Central permission catalogue. Slugs are stable identifiers — never rename.
export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard.view',

  CHANNEL_VIEW: 'channel.view',
  CHANNEL_CREATE: 'channel.create',
  CHANNEL_EDIT: 'channel.edit',
  CHANNEL_DELETE: 'channel.delete',

  STREAM_VIEW: 'stream.view',
  STREAM_START: 'stream.start',
  STREAM_STOP: 'stream.stop',
  STREAM_RESTART: 'stream.restart',

  VIDEO_VIEW: 'video.view',
  VIDEO_UPLOAD: 'video.upload',
  VIDEO_EDIT: 'video.edit',
  VIDEO_DELETE: 'video.delete',

  PLAYLIST_VIEW: 'playlist.view',
  PLAYLIST_CREATE: 'playlist.create',
  PLAYLIST_EDIT: 'playlist.edit',
  PLAYLIST_DELETE: 'playlist.delete',

  EPG_VIEW: 'epg.view',
  EPG_MANAGE: 'epg.manage',

  M3U_IMPORT: 'm3u.import',
  M3U_EXPORT: 'm3u.export',

  USER_VIEW: 'user.view',
  USER_MANAGE: 'user.manage',
  ROLE_VIEW: 'role.view',
  ROLE_MANAGE: 'role.manage',

  LOGS_VIEW: 'logs.view',
  LOGS_DOWNLOAD: 'logs.download',

  ALERTS_MANAGE: 'alerts.manage',
  FFMPEG_SETTINGS: 'ffmpeg.settings',
  SYSTEM_SETTINGS: 'system.settings',

  BACKUP_MANAGE: 'backup.manage',
  BACKUP_RESTORE: 'backup.restore',

  LICENSE_MANAGE: 'license.manage',
  TOKEN_MANAGE: 'token.manage',
} as const;

export type PermissionSlug = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_DEFS: { slug: PermissionSlug; group: string; description: string }[] = [
  { slug: PERMISSIONS.DASHBOARD_VIEW, group: 'dashboard', description: 'View dashboard' },
  { slug: PERMISSIONS.CHANNEL_VIEW, group: 'channels', description: 'View channels' },
  { slug: PERMISSIONS.CHANNEL_CREATE, group: 'channels', description: 'Create channels' },
  { slug: PERMISSIONS.CHANNEL_EDIT, group: 'channels', description: 'Edit channels' },
  { slug: PERMISSIONS.CHANNEL_DELETE, group: 'channels', description: 'Delete channels' },
  { slug: PERMISSIONS.STREAM_VIEW, group: 'streams', description: 'View stream status' },
  { slug: PERMISSIONS.STREAM_START, group: 'streams', description: 'Start streams' },
  { slug: PERMISSIONS.STREAM_STOP, group: 'streams', description: 'Stop streams' },
  { slug: PERMISSIONS.STREAM_RESTART, group: 'streams', description: 'Restart streams' },
  { slug: PERMISSIONS.VIDEO_VIEW, group: 'library', description: 'View video library' },
  { slug: PERMISSIONS.VIDEO_UPLOAD, group: 'library', description: 'Upload videos' },
  { slug: PERMISSIONS.VIDEO_EDIT, group: 'library', description: 'Rename/tag videos' },
  { slug: PERMISSIONS.VIDEO_DELETE, group: 'library', description: 'Delete videos' },
  { slug: PERMISSIONS.PLAYLIST_VIEW, group: 'playlists', description: 'View playlists' },
  { slug: PERMISSIONS.PLAYLIST_CREATE, group: 'playlists', description: 'Create playlists' },
  { slug: PERMISSIONS.PLAYLIST_EDIT, group: 'playlists', description: 'Edit playlists' },
  { slug: PERMISSIONS.PLAYLIST_DELETE, group: 'playlists', description: 'Delete playlists' },
  { slug: PERMISSIONS.EPG_VIEW, group: 'epg', description: 'View EPG' },
  { slug: PERMISSIONS.EPG_MANAGE, group: 'epg', description: 'Manage EPG' },
  { slug: PERMISSIONS.M3U_IMPORT, group: 'm3u', description: 'Import M3U' },
  { slug: PERMISSIONS.M3U_EXPORT, group: 'm3u', description: 'Export M3U' },
  { slug: PERMISSIONS.USER_VIEW, group: 'users', description: 'View users' },
  { slug: PERMISSIONS.USER_MANAGE, group: 'users', description: 'Manage users' },
  { slug: PERMISSIONS.ROLE_VIEW, group: 'users', description: 'View roles' },
  { slug: PERMISSIONS.ROLE_MANAGE, group: 'users', description: 'Manage roles & permissions' },
  { slug: PERMISSIONS.LOGS_VIEW, group: 'logs', description: 'View logs' },
  { slug: PERMISSIONS.LOGS_DOWNLOAD, group: 'logs', description: 'Download logs' },
  { slug: PERMISSIONS.ALERTS_MANAGE, group: 'alerts', description: 'Manage alert settings' },
  { slug: PERMISSIONS.FFMPEG_SETTINGS, group: 'settings', description: 'Change FFmpeg settings' },
  { slug: PERMISSIONS.SYSTEM_SETTINGS, group: 'settings', description: 'Change system settings' },
  { slug: PERMISSIONS.BACKUP_MANAGE, group: 'backups', description: 'Create/download backups' },
  { slug: PERMISSIONS.BACKUP_RESTORE, group: 'backups', description: 'Restore from backup' },
  { slug: PERMISSIONS.LICENSE_MANAGE, group: 'license', description: 'Manage license' },
  { slug: PERMISSIONS.TOKEN_MANAGE, group: 'api', description: 'Manage API tokens' },
];

const ALL = PERMISSION_DEFS.map((p) => p.slug);
const VIEW_ONLY = ALL.filter((s) => s.endsWith('.view'));

export const DEFAULT_ROLES: {
  name: string;
  slug: string;
  description: string;
  isSystem: boolean;
  permissions: PermissionSlug[];
}[] = [
  {
    name: 'Super Admin',
    slug: 'super-admin',
    description: 'Full unrestricted access',
    isSystem: true,
    permissions: ALL,
  },
  {
    name: 'Admin',
    slug: 'admin',
    description: 'Full management access',
    isSystem: true,
    permissions: ALL.filter((s) => s !== PERMISSIONS.LICENSE_MANAGE),
  },
  {
    name: 'Operator',
    slug: 'operator',
    description: 'Operate streams and content; no destructive/system actions',
    isSystem: true,
    permissions: [
      ...VIEW_ONLY,
      PERMISSIONS.STREAM_START,
      PERMISSIONS.STREAM_STOP,
      PERMISSIONS.STREAM_RESTART,
      PERMISSIONS.VIDEO_UPLOAD,
      PERMISSIONS.VIDEO_EDIT,
      PERMISSIONS.PLAYLIST_CREATE,
      PERMISSIONS.PLAYLIST_EDIT,
      PERMISSIONS.M3U_EXPORT,
    ],
  },
  {
    name: 'Viewer',
    slug: 'viewer',
    description: 'Read-only access to allowed screens',
    isSystem: true,
    permissions: VIEW_ONLY,
  },
];
