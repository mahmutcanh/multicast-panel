import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PaginationDto, paginated } from '../../common/http.common';
import { PERMISSIONS } from '../../common/permissions';
import { RequirePermissions } from '../auth/decorators';
import { UpsertChannelDto } from './channel.dto';
import { ChannelsService } from './channels.service';

@ApiTags('channels')
@ApiBearerAuth()
@Controller('channels')
export class ChannelsController {
  constructor(private readonly service: ChannelsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CHANNEL_VIEW)
  async list(@Query() dto: PaginationDto, @Query('category') category?: string) {
    const { items, total } = await this.service.list(dto.page, dto.limit, dto.search, category);
    return paginated(items, total, dto);
  }

  @Get('categories')
  @RequirePermissions(PERMISSIONS.CHANNEL_VIEW)
  categories() {
    return this.service.categories();
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CHANNEL_VIEW)
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CHANNEL_CREATE)
  create(@Body() dto: UpsertChannelDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @RequirePermissions(PERMISSIONS.CHANNEL_EDIT)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpsertChannelDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.CHANNEL_DELETE)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.service.remove(id);
    return { ok: true };
  }
}
