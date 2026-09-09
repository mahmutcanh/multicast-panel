import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { In, Repository } from 'typeorm';
import { PERMISSIONS } from '../../common/permissions';
import { Permission, Role } from '../../database/entities/auth.entities';
import { RequirePermissions } from '../auth/decorators';

class UpsertRoleDto {
  @IsString() @MaxLength(80) name: string;
  @IsOptional() @IsString() description?: string;
  @IsArray() @IsUUID('4', { each: true }) permissionIds: string[];
}

@ApiTags('roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(
    @InjectRepository(Role) private readonly roles: Repository<Role>,
    @InjectRepository(Permission) private readonly perms: Repository<Permission>,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ROLE_VIEW)
  list() {
    return this.roles.find({ order: { name: 'ASC' } });
  }

  @Get('permissions')
  @RequirePermissions(PERMISSIONS.ROLE_VIEW)
  listPermissions() {
    return this.perms.find({ order: { group: 'ASC', slug: 'ASC' } });
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  async create(@Body() dto: UpsertRoleDto) {
    const slug = dto.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const role = this.roles.create({
      name: dto.name,
      slug,
      description: dto.description ?? null,
      isSystem: false,
      permissions: await this.perms.findBy({ id: In(dto.permissionIds) }),
    });
    return this.roles.save(role);
  }

  @Put(':id')
  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpsertRoleDto) {
    const role = await this.roles.findOne({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem && role.slug === 'super-admin') {
      throw new BadRequestException('Super Admin role cannot be modified');
    }
    role.name = dto.name;
    role.description = dto.description ?? role.description;
    role.permissions = await this.perms.findBy({ id: In(dto.permissionIds) });
    return this.roles.save(role);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    const role = await this.roles.findOne({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) throw new BadRequestException('System roles cannot be deleted');
    await this.roles.remove(role);
    return { ok: true };
  }
}
