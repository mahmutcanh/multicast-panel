export * from './auth.entities';
export * from './streaming.entities';
export * from './media.entities';
export * from './ops.entities';

import { ApiToken, AuditLog, LoginHistory, Permission, Role, User } from './auth.entities';
import {
  Channel,
  ChannelOutput,
  StreamLog,
  StreamProcess,
  StreamingNode,
} from './streaming.entities';
import {
  EpgChannel,
  EpgProgram,
  M3uImport,
  Playlist,
  PlaylistItem,
  VideoFile,
} from './media.entities';
import { AlertSetting, Backup, License, Notification, SystemSetting } from './ops.entities';

export const ALL_ENTITIES = [
  User,
  Role,
  Permission,
  ApiToken,
  LoginHistory,
  AuditLog,
  StreamingNode,
  Channel,
  ChannelOutput,
  StreamProcess,
  StreamLog,
  VideoFile,
  Playlist,
  PlaylistItem,
  EpgChannel,
  EpgProgram,
  M3uImport,
  SystemSetting,
  AlertSetting,
  Notification,
  Backup,
  License,
];
