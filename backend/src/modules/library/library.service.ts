import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Repository } from 'typeorm';
import { promisify } from 'util';
import { VideoFile } from '../../database/entities/media.entities';

const execFileAsync = promisify(execFile);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.ts', '.mkv', '.mov', '.avi', '.m4v', '.mpg', '.mpeg', '.webm']);

interface ProbeResult {
  durationSeconds: number;
  videoCodec: string;
  audioCodec: string;
  resolution: string;
  fps: number;
  bitrateKbps: number;
}

@Injectable()
export class LibraryService {
  private readonly logger = new Logger(LibraryService.name);

  constructor(
    @InjectRepository(VideoFile) private readonly repo: Repository<VideoFile>,
    private readonly config: ConfigService,
  ) {}

  mediaDir(): string {
    return this.config.get<{ media: string }>('paths')!.media;
  }

  /** Prevents path traversal out of the media dir. */
  private safePath(...segments: string[]): string {
    const resolved = path.resolve(this.mediaDir(), ...segments);
    if (!resolved.startsWith(path.resolve(this.mediaDir()))) {
      throw new BadRequestException('Invalid path');
    }
    return resolved;
  }

  async list(page: number, limit: number, search?: string, category?: string, tag?: string) {
    const qb = this.repo.createQueryBuilder('v').orderBy('v.created_at', 'DESC');
    if (search) qb.andWhere('v.filename ILIKE :s', { s: `%${search}%` });
    if (category) qb.andWhere('v.category = :category', { category });
    if (tag) qb.andWhere('v.tags @> :tag', { tag: JSON.stringify([tag]) });
    const [items, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
    return { items, total };
  }

  async get(id: string): Promise<VideoFile> {
    const file = await this.repo.findOne({ where: { id } });
    if (!file) throw new NotFoundException('Video not found');
    return file;
  }

  /** Registers an uploaded file (multer already wrote it to the media dir). */
  async registerUpload(diskPath: string, originalName: string, userId: string): Promise<VideoFile> {
    const stat = await fs.stat(diskPath);
    const probe = await this.probe(diskPath).catch((err) => {
      this.logger.warn(`ffprobe failed for ${diskPath}: ${err.message}`);
      return null;
    });
    const thumbnail = await this.generateThumbnail(diskPath).catch(() => null);

    const record = this.repo.create({
      filename: originalName,
      path: diskPath,
      sizeBytes: String(stat.size),
      thumbnailPath: thumbnail,
      uploadedBy: userId,
      ...(probe ?? {}),
    });
    return this.repo.save(record);
  }

  /** Lists subdirectories of the media root — used by the playlist folder picker. */
  async listMediaFolders(): Promise<{ name: string; label: string; path: string }[]> {
    const root = this.mediaDir();
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    const folders: { name: string; label: string; path: string }[] = [
      { name: '', label: 'Ana Klasör', path: root },
    ];
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        folders.push({ name: entry.name, label: entry.name, path: path.join(root, entry.name) });
      }
    }
    return folders;
  }

  /** Lists files inside the server media folder that are not yet in the library. */
  async browseServerFolder(subdir = ''): Promise<{ name: string; path: string; sizeBytes: number; registered: boolean }[]> {
    const dir = this.safePath(subdir);
    const names = await fs.readdir(dir).catch(() => [] as string[]);
    const known = new Set((await this.repo.find({ select: ['path'] })).map((v) => v.path));
    const out: { name: string; path: string; sizeBytes: number; registered: boolean }[] = [];
    for (const name of names) {
      const full = path.join(dir, name);
      const stat = await fs.stat(full).catch(() => null);
      if (!stat?.isFile() || !VIDEO_EXTENSIONS.has(path.extname(name).toLowerCase())) continue;
      out.push({ name, path: full, sizeBytes: stat.size, registered: known.has(full) });
    }
    return out;
  }

  /** Imports an existing server file into the library. */
  async importServerFile(relativePath: string, userId: string): Promise<VideoFile> {
    const full = this.safePath(relativePath);
    const existing = await this.repo.findOne({ where: { path: full } });
    if (existing) return existing;
    await fs.access(full).catch(() => {
      throw new NotFoundException('File not found on server');
    });
    return this.registerUpload(full, path.basename(full), userId);
  }

  async rename(id: string, newName: string): Promise<VideoFile> {
    const file = await this.get(id);
    const safe = newName.replace(/[/\\]/g, '_');
    const newPath = path.join(path.dirname(file.path), safe);
    await fs.rename(file.path, newPath);
    file.filename = safe;
    file.path = newPath;
    return this.repo.save(file);
  }

  async updateMeta(id: string, patch: { tags?: string[]; category?: string }): Promise<VideoFile> {
    const file = await this.get(id);
    if (patch.tags) file.tags = patch.tags;
    if (patch.category !== undefined) file.category = patch.category;
    return this.repo.save(file);
  }

  async remove(id: string, deleteFromDisk: boolean): Promise<void> {
    const file = await this.get(id);
    if (deleteFromDisk) {
      await fs.unlink(file.path).catch(() => undefined);
      if (file.thumbnailPath) await fs.unlink(file.thumbnailPath).catch(() => undefined);
    }
    await this.repo.remove(file);
  }

  async probe(filePath: string): Promise<ProbeResult> {
    const ffprobe = this.config.get<string>('ffprobePath')!;
    const { stdout } = await execFileAsync(ffprobe, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ]);
    const info = JSON.parse(stdout);
    const video = (info.streams ?? []).find((s: { codec_type: string }) => s.codec_type === 'video');
    const audio = (info.streams ?? []).find((s: { codec_type: string }) => s.codec_type === 'audio');
    const fpsExpr: string = video?.avg_frame_rate ?? '0/1';
    const [num, den] = fpsExpr.split('/').map(Number);
    return {
      durationSeconds: parseFloat(info.format?.duration ?? '0') || 0,
      videoCodec: video?.codec_name ?? '',
      audioCodec: audio?.codec_name ?? '',
      resolution: video ? `${video.width}x${video.height}` : '',
      fps: den ? Math.round((num / den) * 100) / 100 : 0,
      bitrateKbps: Math.round((parseInt(info.format?.bit_rate ?? '0', 10) || 0) / 1000),
    };
  }

  private async generateThumbnail(filePath: string): Promise<string> {
    const thumbsDir = path.join(this.mediaDir(), '.thumbnails');
    await fs.mkdir(thumbsDir, { recursive: true });
    const out = path.join(thumbsDir, `${path.basename(filePath)}.jpg`);
    const ffmpeg = this.config.get<string>('ffmpegPath')!;
    await execFileAsync(ffmpeg, [
      '-y', '-ss', '5', '-i', filePath,
      '-frames:v', '1', '-vf', 'scale=320:-1',
      out,
    ]);
    return out;
  }

  async thumbnailStream(id: string): Promise<string> {
    const file = await this.get(id);
    if (!file.thumbnailPath) throw new NotFoundException('No thumbnail');
    return file.thumbnailPath;
  }
}
