import { Controller, Get, Header, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationDto, paginated } from '../../common/http.common';
import { PERMISSIONS } from '../../common/permissions';
import { AuditLog, LoginHistory } from '../../database/entities/auth.entities';
import { StreamLog } from '../../database/entities/streaming.entities';
import { Notification } from '../../database/entities/ops.entities';
import { RequirePermissions } from '../auth/decorators';

type LogKind = 'streaming' | 'audit' | 'security' | 'alerts';

@ApiTags('logs')
@ApiBearerAuth()
@Controller('logs')
export class LogsController {
  constructor(
    @InjectRepository(StreamLog) private readonly streamLogs: Repository<StreamLog>,
    @InjectRepository(AuditLog) private readonly auditLogs: Repository<AuditLog>,
    @InjectRepository(LoginHistory) private readonly loginHistory: Repository<LoginHistory>,
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.LOGS_VIEW)
  @ApiOperation({ summary: 'Unified log query. kind = streaming|audit|security|alerts' })
  async list(
    @Query() dto: PaginationDto,
    @Query('kind') kind: LogKind = 'streaming',
    @Query('level') level?: string,
    @Query('channelId') channelId?: string,
  ) {
    const { items, total } = await this.query(kind, dto, level, channelId);
    return paginated(items, total, dto);
  }

  @Get('export')
  @RequirePermissions(PERMISSIONS.LOGS_DOWNLOAD)
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="logs.txt"')
  async export(
    @Query('kind') kind: LogKind = 'streaming',
    @Query('level') level?: string,
    @Query('channelId') channelId?: string,
  ) {
    const { items } = await this.query(kind, { page: 1, limit: 5000 } as PaginationDto, level, channelId);
    return items.map((row) => JSON.stringify(row)).join('\n');
  }

  private async query(
    kind: LogKind,
    dto: PaginationDto,
    level?: string,
    channelId?: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<{ items: any[]; total: number }> {
    const skip = (dto.page - 1) * dto.limit;
    switch (kind) {
      case 'audit': {
        const qb = this.auditLogs.createQueryBuilder('a').orderBy('a.created_at', 'DESC');
        if (dto.search) qb.where('a.action ILIKE :s OR a.user_email ILIKE :s', { s: `%${dto.search}%` });
        const [items, total] = await qb.skip(skip).take(dto.limit).getManyAndCount();
        return { items, total };
      }
      case 'security': {
        const qb = this.loginHistory.createQueryBuilder('l').orderBy('l.created_at', 'DESC');
        if (dto.search) qb.where('l.email ILIKE :s OR l.ip ILIKE :s', { s: `%${dto.search}%` });
        const [items, total] = await qb.skip(skip).take(dto.limit).getManyAndCount();
        return { items, total };
      }
      case 'alerts': {
        const qb = this.notifications.createQueryBuilder('n').orderBy('n.created_at', 'DESC');
        if (dto.search) qb.where('n.title ILIKE :s OR n.message ILIKE :s', { s: `%${dto.search}%` });
        const [items, total] = await qb.skip(skip).take(dto.limit).getManyAndCount();
        return { items, total };
      }
      case 'streaming':
      default: {
        const qb = this.streamLogs.createQueryBuilder('sl').orderBy('sl.created_at', 'DESC');
        if (dto.search) qb.andWhere('sl.message ILIKE :s', { s: `%${dto.search}%` });
        if (level) qb.andWhere('sl.level = :level', { level });
        if (channelId) qb.andWhere('sl.channel_id = :channelId', { channelId });
        const [items, total] = await qb.skip(skip).take(dto.limit).getManyAndCount();
        return { items, total };
      }
    }
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([StreamLog, AuditLog, LoginHistory, Notification])],
  controllers: [LogsController],
})
export class LogsModule {}
