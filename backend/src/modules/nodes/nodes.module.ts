import { Controller, Get, Module } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PERMISSIONS } from '../../common/permissions';
import { StreamingNode } from '../../database/entities/streaming.entities';
import { RequirePermissions } from '../auth/decorators';

/**
 * v1: single local node, read-only. Schema and endpoints exist so that
 * multi-node streaming (node assignment, health, load balancing) can be
 * added in v2 without breaking the API surface.
 */
@ApiTags('nodes')
@ApiBearerAuth()
@Controller('nodes')
export class NodesController {
  constructor(@InjectRepository(StreamingNode) private readonly repo: Repository<StreamingNode>) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SYSTEM_SETTINGS)
  list() {
    return this.repo.find({ order: { name: 'ASC' } });
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([StreamingNode])],
  controllers: [NodesController],
})
export class NodesModule {}
