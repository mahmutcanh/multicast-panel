import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Channel, ChannelOutput, StreamProcess } from '../../database/entities/streaming.entities';
import { LicenseService } from '../license/license.service';
import { UpsertChannelDto } from './channel.dto';

@Injectable()
export class ChannelsService {
  constructor(
    @InjectRepository(Channel) private readonly channels: Repository<Channel>,
    @InjectRepository(ChannelOutput) private readonly outputs: Repository<ChannelOutput>,
    @InjectRepository(StreamProcess) private readonly processes: Repository<StreamProcess>,
    private readonly license: LicenseService,
  ) {}

  async list(page: number, limit: number, search?: string, category?: string) {
    const qb = this.channels
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.outputs', 'outputs')
      .orderBy('c.priority', 'DESC')
      .addOrderBy('c.name', 'ASC');
    if (search) qb.andWhere('(c.name ILIKE :s OR c.udp_ip ILIKE :s)', { s: `%${search}%` });
    if (category) qb.andWhere('c.category = :category', { category });
    const [items, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
    const procs = await this.processes.find();
    const byChannel = new Map(procs.map((p) => [p.channelId, p]));
    return {
      items: items.map((c) => ({ ...c, process: byChannel.get(c.id) ?? null })),
      total,
    };
  }

  async get(id: string): Promise<Channel & { process: StreamProcess | null }> {
    const channel = await this.channels.findOne({ where: { id } });
    if (!channel) throw new NotFoundException('Channel not found');
    const process = await this.processes.findOne({ where: { channelId: id } });
    return { ...channel, process };
  }

  async categories(): Promise<string[]> {
    const rows: { category: string }[] = await this.channels
      .createQueryBuilder('c')
      .select('DISTINCT c.category', 'category')
      .where("c.category IS NOT NULL AND c.category <> ''")
      .getRawMany();
    return rows.map((r) => r.category).sort();
  }

  async create(dto: UpsertChannelDto): Promise<Channel> {
    await this.assertChannelLimit();
    this.validateSource(dto);
    await this.assertUdpTargetFree(dto.udpIp, dto.udpPort);

    const { outputs, ...fields } = dto;
    if (fields.copyMode === undefined) fields.copyMode = true;
    const channel = await this.channels.save(this.channels.create(fields as Partial<Channel>));
    await this.saveOutputs(channel.id, outputs);
    return this.channels.findOneOrFail({ where: { id: channel.id } });
  }

  async update(id: string, dto: UpsertChannelDto): Promise<Channel> {
    const existing = await this.channels.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('Channel not found');
    this.validateSource(dto);
    if (dto.udpIp !== existing.udpIp || dto.udpPort !== existing.udpPort) {
      await this.assertUdpTargetFree(dto.udpIp, dto.udpPort, id);
    }
    const { outputs, ...fields } = dto;
    await this.channels.save({ ...existing, ...fields, outputs: undefined });
    if (outputs) {
      await this.outputs.delete({ channelId: id });
      await this.saveOutputs(id, outputs);
    }
    return this.channels.findOneOrFail({ where: { id } });
  }

  async remove(id: string): Promise<void> {
    const channel = await this.channels.findOne({ where: { id } });
    if (!channel) throw new NotFoundException('Channel not found');
    if (channel.status === 'running' || channel.status === 'starting') {
      throw new BadRequestException('Stop the stream before deleting the channel');
    }
    await this.channels.remove(channel);
  }

  async setStatus(id: string, status: Channel['status']): Promise<void> {
    await this.channels.update(id, { status });
  }

  private async saveOutputs(channelId: string, outputs?: UpsertChannelDto['outputs']): Promise<void> {
    const defs = outputs?.length ? outputs : [{ type: 'udp' as const, enabled: true }];
    for (const o of defs) {
      await this.outputs.save(
        this.outputs.create({
          channelId,
          type: o.type,
          enabled: o.enabled ?? true,
          url: o.url ?? '',
          config: o.config ?? {},
          publicEnabled: o.publicEnabled ?? false,
          tokenRequired: o.tokenRequired ?? true,
        }),
      );
    }
  }

  private validateSource(dto: UpsertChannelDto): void {
    const needsUrl = ['file', 'm3u8', 'rtsp', 'rtmp', 'http', 'udp', 'm3u_link', 'camera', 'folder'];
    if (needsUrl.includes(dto.sourceType) && !dto.sourceUrl) {
      throw new BadRequestException(`sourceUrl is required for source type "${dto.sourceType}"`);
    }
    if (dto.sourceType === 'playlist' && !dto.playlistId) {
      throw new BadRequestException('playlistId is required for playlist source');
    }
  }

  private async assertUdpTargetFree(ip: string, port: number, excludeId?: string): Promise<void> {
    const qb = this.channels
      .createQueryBuilder('c')
      .where('c.udp_ip = :ip AND c.udp_port = :port', { ip, port });
    if (excludeId) qb.andWhere('c.id != :excludeId', { excludeId });
    if (await qb.getOne()) {
      throw new BadRequestException(`UDP target ${ip}:${port} is already used by another channel`);
    }
  }

  private async assertChannelLimit(): Promise<void> {
    const max = await this.license.maxChannels();
    if (max > 0 && (await this.channels.count()) >= max) {
      throw new BadRequestException(`License limit reached (${max} channels)`);
    }
  }
}
