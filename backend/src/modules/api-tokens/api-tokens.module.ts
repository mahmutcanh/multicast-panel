import {
  Body,
  Controller,
  Delete,
  Get,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { IsArray, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { createHash, randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { PERMISSIONS } from '../../common/permissions';
import { ApiToken } from '../../database/entities/auth.entities';
import { AuthUser, CurrentUser, RequirePermissions } from '../auth/decorators';

class CreateTokenDto {
  @IsString() @MaxLength(120) name: string;
  @IsArray() @IsString({ each: true }) scopes: string[];
  @IsOptional() @IsISO8601() expiresAt?: string;
}

@ApiTags('api-tokens')
@ApiBearerAuth()
@Controller('api-tokens')
export class ApiTokensController {
  constructor(@InjectRepository(ApiToken) private readonly repo: Repository<ApiToken>) {}

  @Get()
  @RequirePermissions(PERMISSIONS.TOKEN_MANAGE)
  list() {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  @Post()
  @RequirePermissions(PERMISSIONS.TOKEN_MANAGE)
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateTokenDto) {
    // Plaintext token shown once; only the sha256 hash is stored.
    const plaintext = `mcp_${randomBytes(32).toString('hex')}`;
    const record = await this.repo.save(
      this.repo.create({
        userId: user.id,
        name: dto.name,
        tokenHash: createHash('sha256').update(plaintext).digest('hex'),
        scopes: dto.scopes,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      }),
    );
    return { id: record.id, name: record.name, token: plaintext };
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.TOKEN_MANAGE)
  async revoke(@Param('id', ParseUUIDPipe) id: string) {
    const token = await this.repo.findOne({ where: { id } });
    if (!token) throw new NotFoundException('Token not found');
    await this.repo.update(id, { revokedAt: new Date() });
    return { ok: true };
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([ApiToken])],
  controllers: [ApiTokensController],
})
export class ApiTokensModule {}
