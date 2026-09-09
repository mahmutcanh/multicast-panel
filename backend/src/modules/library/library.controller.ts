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
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { Response } from 'express';
import { diskStorage } from 'multer';
import * as path from 'path';
import { PaginationDto, paginated } from '../../common/http.common';
import { PERMISSIONS } from '../../common/permissions';
import { AuthUser, CurrentUser, RequirePermissions } from '../auth/decorators';
import { LibraryService } from './library.service';

class RenameDto {
  @IsString() @MaxLength(255) name: string;
}
class MetaDto {
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsString() @MaxLength(120) category?: string;
}
class ImportServerFileDto {
  @IsString() @MaxLength(1000) path: string;
}
class DeleteDto {
  @IsOptional() @IsBoolean() deleteFromDisk?: boolean;
}

function sanitizeFilename(name: string): string {
  const map: Record<string, string> = {
    ş: 's', Ş: 'S', ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G',
    ü: 'u', Ü: 'U', ö: 'o', Ö: 'O', ı: 'i', İ: 'I',
    â: 'a', Â: 'A', î: 'i', Î: 'I', û: 'u', Û: 'U',
  };
  return name
    .replace(/[şŞçÇğĞüÜöÖıİâÂîÎûÛ]/g, (c) => map[c] ?? c)
    .replace(/[^\w.\-]/g, '_');
}

const uploadStorage = diskStorage({
  destination: (_req, _file, cb) => cb(null, process.env.MEDIA_DIR ?? '/data/media'),
  filename: (_req, file, cb) => {
    const safe = sanitizeFilename(file.originalname);
    cb(null, `${Date.now()}_${safe}`);
  },
});

@ApiTags('library')
@ApiBearerAuth()
@Controller('library')
export class LibraryController {
  constructor(
    private readonly service: LibraryService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.VIDEO_VIEW)
  async list(
    @Query() dto: PaginationDto,
    @Query('category') category?: string,
    @Query('tag') tag?: string,
  ) {
    const { items, total } = await this.service.list(dto.page, dto.limit, dto.search, category, tag);
    return paginated(items, total, dto);
  }

  @Post('upload')
  @RequirePermissions(PERMISSIONS.VIDEO_UPLOAD)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { files: { type: 'array', items: { type: 'string', format: 'binary' } } } } })
  @UseInterceptors(FilesInterceptor('files', 20, { storage: uploadStorage }))
  async upload(@UploadedFiles() files: Express.Multer.File[], @CurrentUser() user: AuthUser) {
    const results = [];
    for (const file of files ?? []) {
      results.push(await this.service.registerUpload(file.path, file.originalname, user.id));
    }
    return results;
  }

  @Get('server-folders')
  @RequirePermissions(PERMISSIONS.VIDEO_VIEW)
  listFolders() {
    return this.service.listMediaFolders();
  }

  @Get('server-files')
  @RequirePermissions(PERMISSIONS.VIDEO_VIEW)
  browse(@Query('dir') dir?: string) {
    return this.service.browseServerFolder(dir ?? '');
  }

  @Post('import-server-file')
  @RequirePermissions(PERMISSIONS.VIDEO_UPLOAD)
  importServerFile(@Body() dto: ImportServerFileDto, @CurrentUser() user: AuthUser) {
    return this.service.importServerFile(dto.path, user.id);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.VIDEO_VIEW)
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(id);
  }

  @Get(':id/thumbnail')
  @RequirePermissions(PERMISSIONS.VIDEO_VIEW)
  async thumbnail(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    res.sendFile(await this.service.thumbnailStream(id));
  }

  @Get(':id/preview')
  @RequirePermissions(PERMISSIONS.VIDEO_VIEW)
  async preview(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const file = await this.service.get(id);
    res.sendFile(path.resolve(file.path));
  }

  @Put(':id/rename')
  @RequirePermissions(PERMISSIONS.VIDEO_EDIT)
  rename(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RenameDto) {
    return this.service.rename(id, dto.name);
  }

  @Put(':id/meta')
  @RequirePermissions(PERMISSIONS.VIDEO_EDIT)
  meta(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MetaDto) {
    return this.service.updateMeta(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.VIDEO_DELETE)
  async remove(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DeleteDto) {
    await this.service.remove(id, dto.deleteFromDisk !== false);
    return { ok: true };
  }
}
