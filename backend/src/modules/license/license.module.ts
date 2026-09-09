import { Body, Controller, Get, Module, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IsString, MaxLength } from 'class-validator';
import { PERMISSIONS } from '../../common/permissions';
import { License } from '../../database/entities/ops.entities';
import { RequirePermissions } from '../auth/decorators';
import { LicenseService } from './license.service';

class ActivateLicenseDto {
  @IsString() @MaxLength(10000) key: string;
}

@ApiTags('license')
@ApiBearerAuth()
@Controller('license')
export class LicenseController {
  constructor(private readonly service: LicenseService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.LICENSE_MANAGE)
  async current() {
    const license = await this.service.current();
    // never return the raw key
    return { ...license, licenseKey: license.licenseKey ? '••••' : '' };
  }

  @Post('activate')
  @RequirePermissions(PERMISSIONS.LICENSE_MANAGE)
  async activate(@Body() dto: ActivateLicenseDto) {
    const license = await this.service.activate(dto.key);
    return { ...license, licenseKey: '••••' };
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([License])],
  controllers: [LicenseController],
  providers: [LicenseService],
  exports: [LicenseService],
})
export class LicenseModule {}
