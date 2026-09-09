import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { ChildProcess, execFile, spawn } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);
import { promises as fs } from 'fs';
import Redis from 'ioredis';
import * as os from 'os';
import * as path from 'path';
import { Repository } from 'typeorm';
import {
  CH_ALERT,
  CH_CMD,
  CH_LOG,
  CH_STATUS,
  StreamCommand,
} from '../common/events.service';
import { REDIS, REDIS_SUB } from '../common/redis.module';
import {
  Channel,
  StreamLog,
  StreamProcess,
  StreamState,
} from '../database/entities/streaming.entities';
import { Playlist } from '../database/entities/media.entities';
import { BuilderEnv, buildFfmpegArgs, buildVlcArgs } from '../modules/ffmpeg/ffmpeg-builder';

const GRACEFUL_STOP_TIMEOUT_MS = 8_000;
const WATCHDOG_INTERVAL_MS = 15_000;
const PROGRESS_STALL_MS = 120_000;
const LOG_RING_SIZE = 200;
const VIDEO_EXTENSIONS = new Set(['.mp4', '.ts', '.mkv', '.mov', '.avi', '.m4v', '.mpg', '.mpeg', '.webm']);

interface ManagedStream {
  proc: ChildProcess;
  channelId: string;
  manualStop: boolean;
  restartCount: number;
  lastProgressAt: number;
  lastBitrateKbps: number;
  lastFps: number;
  logRing: string[];
  startedAt: Date;
}

/**
 * Owns every FFmpeg process. One managed child process per channel.
 * Commands arrive over Redis (mcp:cmd); state/log events are published back
 * (mcp:status / mcp:log) and persisted to stream_processes / stream_logs.
 */
@Injectable()
export class StreamSupervisorService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(StreamSupervisorService.name);
  private readonly streams = new Map<string, ManagedStream>();
  private watchdogTimer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(Channel) private readonly channels: Repository<Channel>,
    @InjectRepository(StreamProcess) private readonly processes: Repository<StreamProcess>,
    @InjectRepository(StreamLog) private readonly streamLogs: Repository<StreamLog>,
    @InjectRepository(Playlist) private readonly playlists: Repository<Playlist>,
    private readonly config: ConfigService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(REDIS_SUB) private readonly sub: Redis,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.sub.subscribe(CH_CMD);
    this.sub.on('message', (channel, raw) => {
      if (channel !== CH_CMD) return;
      const cmd = JSON.parse(raw) as StreamCommand;
      void this.handleCommand(cmd).catch(async (err) => {
        this.logger.error(`Command ${cmd.type} ${cmd.channelId} failed: ${err.message}`);
        // Status 'starting'/'restarting' takılı kalmasın — 'error'a çek ve kullanıcıya bildir
        if (cmd.type === 'start' || cmd.type === 'restart') {
          await this.updateState(cmd.channelId, 'error' as StreamState, {
            pid: null,
            stoppedAt: new Date(),
            lastError: err.message,
            lastErrorAt: new Date(),
          }).catch(() => undefined);
        }
      });
    });

    this.watchdogTimer = setInterval(() => void this.watchdogTick(), WATCHDOG_INTERVAL_MS);

    // Recover: autostart channels + channels that were running before restart.
    const toStart = await this.channels
      .createQueryBuilder('c')
      .where('c.auto_start = true OR c.status IN (:...states)', {
        states: ['running', 'starting', 'restarting'],
      })
      .getMany();
    for (const channel of toStart) {
      this.logger.log(`Auto-starting channel ${channel.name}`);
      await this.start(channel.id).catch((err) =>
        this.logger.error(`Autostart ${channel.name} failed: ${err.message}`),
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    for (const [channelId] of this.streams) {
      await this.stop(channelId, false).catch(() => undefined);
    }
  }

  // ── Command handling ───────────────────────────────────────────────────

  private async handleCommand(cmd: StreamCommand): Promise<void> {
    switch (cmd.type) {
      case 'start':
        return this.start(cmd.channelId);
      case 'stop':
        return this.stop(cmd.channelId, false);
      case 'kill':
        return this.stop(cmd.channelId, true);
      case 'restart':
        await this.stop(cmd.channelId, false).catch(() => undefined);
        return this.start(cmd.channelId, { keepRestartCount: true });
    }
  }

  async start(channelId: string, opts: { keepRestartCount?: boolean; isAutoRestart?: boolean } = {}): Promise<void> {
    if (this.streams.has(channelId)) {
      this.logger.warn(`Channel ${channelId} already running`);
      return;
    }
    const channel = await this.channels.findOne({ where: { id: channelId } });
    if (!channel) throw new Error('Channel not found');

    let targetChannel = channel;
    if (
      (channel.sourceType === 'youtube' || (channel.sourceUrl && /youtube\.com|youtu\.be/.test(channel.sourceUrl))) &&
      channel.sourceUrl
    ) {
      try {
        const streamUrl = await this.resolveYoutubeUrl(channel.sourceUrl);
        if (streamUrl) {
          targetChannel = { ...channel, sourceUrl: streamUrl };
        }
      } catch (err: any) {
        this.logger.error(`YouTube resolve failed for ${channel.name}: ${err?.message || err}`);
      }
    }

    const env = await this.builderEnv(targetChannel);
    const isVlc = targetChannel.engine === 'vlc';
    const binary: string = isVlc
      ? this.config.get<string>('vlcPath')!
      : ((await this.settingValue('ffmpeg.path')) as string | null) ??
        this.config.get<string>('ffmpegPath')!;
    const args = isVlc ? buildVlcArgs(targetChannel, env) : buildFfmpegArgs(targetChannel, env);

    // HLS output dir must exist before ffmpeg writes segments.
    if ((channel.outputs ?? []).some((o) => o.type === 'hls' && o.enabled)) {
      await fs.mkdir(path.join(this.hlsDir(), channel.id), { recursive: true });
    }

    this.logger.log(`Starting [${channel.name}] ${binary} ${args.join(' ')}`);
    const proc: ChildProcess = spawn(binary, args, {
      stdio: ['ignore', 'pipe', 'pipe'] as const,
    });

    const prev = opts.keepRestartCount
      ? await this.processes.findOne({ where: { channelId } })
      : null;
    const managed: ManagedStream = {
      proc,
      channelId,
      manualStop: false,
      restartCount: opts.isAutoRestart ? (prev?.restartCount ?? 0) : 0,
      lastProgressAt: Date.now(),
      lastBitrateKbps: 0,
      lastFps: 0,
      logRing: [],
      startedAt: new Date(),
    };
    this.streams.set(channelId, managed);

    proc.stdout?.on('data', (buf: Buffer) => this.parseProgress(managed, buf.toString()));
    proc.stderr?.on('data', (buf: Buffer) => this.captureLogs(managed, buf.toString()));
    proc.on('error', (err) => {
      void this.persistLog(channelId, 'error', `spawn error: ${err.message}`);
    });
    proc.on('exit', (code, signal) => void this.onExit(managed, code, signal));

    await this.updateState(channelId, 'running', {
      pid: proc.pid ?? null,
      startedAt: managed.startedAt,
      restartCount: managed.restartCount,
    });
    await this.persistLog(channelId, 'info', `stream started (pid ${proc.pid})`, 'system');
  }

  async stop(channelId: string, force: boolean): Promise<void> {
    const managed = this.streams.get(channelId);
    if (!managed) {
      await this.updateState(channelId, 'stopped', { pid: null, stoppedAt: new Date() });
      return;
    }
    managed.manualStop = true;
    if (force) {
      managed.proc.kill('SIGKILL');
      return;
    }
    managed.proc.kill('SIGTERM');
    // escalate if ffmpeg ignores SIGTERM
    setTimeout(() => {
      if (this.streams.has(channelId)) managed.proc.kill('SIGKILL');
    }, GRACEFUL_STOP_TIMEOUT_MS).unref();
  }

  // ── Process lifecycle ──────────────────────────────────────────────────

  private async onExit(managed: ManagedStream, code: number | null, signal: string | null): Promise<void> {
    this.streams.delete(managed.channelId);
    const channel = await this.channels.findOne({ where: { id: managed.channelId } });
    const label = channel?.name ?? managed.channelId;

    if (managed.manualStop) {
      await this.updateState(managed.channelId, 'stopped', { pid: null, stoppedAt: new Date() });
      await this.persistLog(managed.channelId, 'info', `stream stopped (code ${code}, signal ${signal})`, 'system');
      return;
    }

    // Crash path
    const lastLines = managed.logRing.slice(-5).join('\n');
    await this.persistLog(managed.channelId, 'error', `ffmpeg exited unexpectedly (code ${code}, signal ${signal})`, 'system');
    await this.publishAlert('ffmpeg_crash', 'FFmpeg crashed', `Channel "${label}" ffmpeg exited (code ${code}).`, 'critical', {
      channelId: managed.channelId,
      lastLines,
    });

    const canRestart =
      channel?.autoRestart &&
      (channel.restartMax === 0 || managed.restartCount < channel.restartMax);

    if (!canRestart) {
      await this.updateState(managed.channelId, 'crashed', {
        pid: null,
        stoppedAt: new Date(),
        lastError: `exit code ${code}, signal ${signal}\n${lastLines}`,
        lastErrorAt: new Date(),
      });
      await this.publishAlert('stream_offline', 'Stream offline', `Channel "${label}" is offline (restart limit reached or auto-restart disabled).`, 'critical', { channelId: managed.channelId });
      return;
    }

    const nextCount = managed.restartCount + 1;
    const backoffMs = Math.min(2 ** Math.min(nextCount, 6) * 1000, 60_000);
    await this.updateState(managed.channelId, 'restarting', {
      pid: null,
      restartCount: nextCount,
      lastError: `exit code ${code}\n${lastLines}`,
      lastErrorAt: new Date(),
    });
    await this.publishAlert('auto_restart', 'Stream auto-restart', `Channel "${label}" restarting in ${backoffMs / 1000}s (attempt ${nextCount}).`, 'warning', { channelId: managed.channelId });

    setTimeout(() => {
      void this.startWithCount(managed.channelId, nextCount);
    }, backoffMs).unref();
  }

  private async startWithCount(channelId: string, restartCount: number): Promise<void> {
    try {
      await this.start(channelId, { isAutoRestart: true });
      const managed = this.streams.get(channelId);
      if (managed) {
        managed.restartCount = restartCount;
        await this.processes.update({ channelId }, { restartCount });
      }
    } catch (err) {
      this.logger.error(`Auto-restart of ${channelId} failed: ${(err as Error).message}`);
      await this.updateState(channelId, 'crashed', { lastError: (err as Error).message, lastErrorAt: new Date() });
    }
  }

  // ── Progress / logs ────────────────────────────────────────────────────

  private parseProgress(managed: ManagedStream, chunk: string): void {
    managed.lastProgressAt = Date.now();
    for (const line of chunk.split('\n')) {
      const [key, value] = line.trim().split('=');
      if (key === 'bitrate' && value) {
        const match = /([\d.]+)\s*kbits\/s/.exec(value);
        if (match) managed.lastBitrateKbps = parseFloat(match[1]);
      } else if (key === 'fps' && value) {
        managed.lastFps = parseFloat(value) || 0;
      } else if (key === 'progress') {
        void this.publishStatus(managed.channelId, 'running', managed);
        void this.processes.update(
          { channelId: managed.channelId },
          { bitrateKbps: managed.lastBitrateKbps, fps: managed.lastFps },
        ).catch(() => undefined);
      }
    }
  }

  private captureLogs(managed: ManagedStream, chunk: string): void {
    managed.lastProgressAt = Date.now();
    for (const line of chunk.split('\n')) {
      const text = line.trim();
      if (!text) continue;
      managed.logRing.push(text);
      if (managed.logRing.length > LOG_RING_SIZE) managed.logRing.shift();
      const level = /error|fail|invalid|unable/i.test(text) ? 'error' : 'warn';
      void this.redis.publish(
        CH_LOG,
        JSON.stringify({ channelId: managed.channelId, level, message: text, ts: Date.now() }),
      );
      if (level === 'error') void this.persistLog(managed.channelId, 'error', text);
    }
  }

  private async watchdogTick(): Promise<void> {
    for (const managed of this.streams.values()) {
      const stalled = Date.now() - managed.lastProgressAt > PROGRESS_STALL_MS;
      if (!stalled) continue;
      const channel = await this.channels.findOne({ where: { id: managed.channelId } });
      await this.persistLog(managed.channelId, 'warn', 'watchdog: no progress from ffmpeg — restarting', 'watchdog');
      await this.publishAlert('stream_offline', 'Watchdog restart', `Channel "${channel?.name ?? managed.channelId}" stalled — watchdog is restarting it.`, 'warning', { channelId: managed.channelId });
      managed.manualStop = false; // let exit handler run the auto-restart path
      managed.proc.kill('SIGKILL');
    }
  }

  // ── Persistence / events ───────────────────────────────────────────────

  private async updateState(channelId: string, state: StreamState, patch: Partial<StreamProcess> = {}): Promise<void> {
    let proc = await this.processes.findOne({ where: { channelId } });
    if (!proc) proc = this.processes.create({ channelId });
    Object.assign(proc, patch, { state });
    await this.processes.save(proc);
    await this.channels.update(channelId, { status: state });
    await this.publishStatus(channelId, state, this.streams.get(channelId) ?? null, proc);
  }

  private async publishStatus(
    channelId: string,
    state: StreamState,
    managed: ManagedStream | null,
    proc?: StreamProcess,
  ): Promise<void> {
    await this.redis.publish(
      CH_STATUS,
      JSON.stringify({
        channelId,
        state,
        pid: managed?.proc.pid ?? proc?.pid ?? null,
        bitrateKbps: managed?.lastBitrateKbps ?? 0,
        fps: managed?.lastFps ?? 0,
        restartCount: managed?.restartCount ?? proc?.restartCount ?? 0,
        uptimeSeconds: managed ? Math.floor((Date.now() - managed.startedAt.getTime()) / 1000) : 0,
        ts: Date.now(),
      }),
    );
  }

  private async persistLog(
    channelId: string,
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    source = 'ffmpeg',
  ): Promise<void> {
    await this.streamLogs.save(this.streamLogs.create({ channelId, level, message, source }));
    await this.redis.publish(CH_LOG, JSON.stringify({ channelId, level, message, ts: Date.now() }));
  }

  private async publishAlert(
    event: string,
    title: string,
    message: string,
    severity: 'info' | 'warning' | 'critical',
    meta: Record<string, unknown>,
  ): Promise<void> {
    await this.redis.publish(CH_ALERT, JSON.stringify({ event, title, message, severity, meta }));
  }

  // ── Sources: playlist / folder concat files ────────────────────────────

  private async builderEnv(channel: Channel): Promise<BuilderEnv> {
    const env: BuilderEnv = {
      ffmpegPath: this.config.get('ffmpegPath')!,
      hlsDir: this.hlsDir(),
      defaultInterfaceIp:
        ((await this.settingValue('network.interfaceIp')) as string) ||
        this.config.get('multicastInterfaceIp') ||
        '',
    };
    if (channel.sourceType === 'playlist' || channel.sourceType === 'folder') {
      env.concatFilePath = await this.writeConcatFile(channel);
    }
    return env;
  }

  private async writeConcatFile(channel: Channel): Promise<string> {
    interface Entry { filePath: string; duration?: number }
    let entries: Entry[] = [];

    if (channel.sourceType === 'folder') {
      const dir = channel.sourceUrl ?? '';
      const files = await fs.readdir(dir).catch(() => [] as string[]);
      entries = files
        .filter((f) => VIDEO_EXTENSIONS.has(path.extname(f).toLowerCase()))
        .sort()
        .map((f) => ({ filePath: path.join(dir, f) }));
    } else if (channel.playlistId) {
      const playlist = await this.playlists.findOne({ where: { id: channel.playlistId } });
      if (playlist) {
        const items = [...(playlist.items ?? [])].sort((a, b) => a.position - b.position);
        if (playlist.mode === 'random') {
          for (let i = items.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [items[i], items[j]] = [items[j], items[i]];
          }
        }
        entries = items
          .map((i) => ({
            filePath: i.videoFile?.path || i.url,
            duration: i.videoFile?.durationSeconds ?? undefined,
          }))
          .filter((e) => Boolean(e.filePath)) as Entry[];
        if (playlist.mode === 'single_loop' && entries.length > 0) entries = [entries[0]];
      }
    }
    if (entries.length === 0) throw new Error('Playlist/folder source has no playable items');

    const dir = path.join(os.tmpdir(), 'mcp-concat');
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${channel.id}.txt`);

    // ffconcat parser treats backslash as escape — use forward slashes on all platforms
    const toFwd = (p: string) => p.replace(/\\/g, '/');
    const body = entries
      .map((e) => `file '${toFwd(e.filePath).replace(/'/g, "\\'")}'`)
      .join('\n');
    await fs.writeFile(file, `ffconcat version 1.0\n${body}\n`, 'utf8');
    return toFwd(file);
  }

  private hlsDir(): string {
    return this.config.get<{ hls: string }>('paths')!.hls;
  }

  private async settingValue(key: string): Promise<unknown> {
    const row: { value: unknown }[] = await this.channels.query(
      'SELECT value FROM system_settings WHERE key = $1',
      [key],
    );
    return row[0]?.value ?? null;
  }

  private async resolveYoutubeUrl(url: string): Promise<string> {
    this.logger.log(`Resolving YouTube stream URL via yt-dlp: ${url}`);
    const { stdout } = await execFileAsync('yt-dlp', ['-g', '-f', 'best[ext=mp4]/best', url], { timeout: 30000 });
    const lines = stdout.trim().split('\n').map((l) => l.trim()).filter(Boolean);
    return lines[0] || url;
  }
}
