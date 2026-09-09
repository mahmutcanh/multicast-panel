import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaginationDto, paginated } from '../../common/http.common';
import { PERMISSIONS } from '../../common/permissions';
import { RequirePermissions } from '../auth/decorators';
import { PASSWORD_MESSAGE, PASSWORD_REGEX } from '../auth/dto';
import { UsersService } from './users.service';

class CreateUserDto {
  @IsEmail() email: string;
  @IsString() @MaxLength(120) name: string;
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE }) password: string;
  @IsOptional() @IsString() locale?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) roleIds?: string[];
}

class UpdateUserDto {
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE }) password?: string;
  @IsOptional() @IsString() locale?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) roleIds?: string[];
}

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.USER_VIEW)
  async list(@Query() dto: PaginationDto) {
    const { items, total } = await this.service.list(dto.page, dto.limit, dto.search);
    return paginated(items, total, dto);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.USER_VIEW)
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  create(@Body() dto: CreateUserDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.service.remove(id);
    return { ok: true };
  }
}
