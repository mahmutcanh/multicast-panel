import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Repository } from 'typeorm';
import { Role, User } from '../../database/entities/auth.entities';
import { SystemSetting } from '../../database/entities/ops.entities';
import { PASSWORD_MESSAGE, PASSWORD_REGEX } from '../auth/dto';
import { Public } from '../auth/decorators';

class InstallDto {
  @IsEmail() adminEmail: string;
  @IsString() @MaxLength(120) adminName: string;
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE }) adminPassword: string;
  @IsOptional() @IsIn(['tr', 'en']) locale?: 'tr' | 'en';
  @IsOptional() @IsBoolean() keepSampleChannels?: boolean;
}

/**
 * First-run wizard. Every endpoint is public but hard-locked the moment
 * setup completes (installed flag) or any user exists.
 */
@Injectable()
export class InstallerService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Role) private readonly roles: Repository<Role>,
    @InjectRepository(SystemSetting) private readonly settings: Repository<SystemSetting>,
  ) {}

  async status(): Promise<{ installed: boolean; hasUsers: boolean }> {
    const installedRow = await this.settings.findOne({ where: { key: 'installed' } });
    const hasUsers = (await this.users.count()) > 0;
    return { installed: installedRow?.value === true || hasUsers, hasUsers };
  }

  async install(dto: InstallDto): Promise<{ ok: boolean }> {
    const { installed } = await this.status();
    if (installed) throw new BadRequestException('Panel is already installed');

    const superAdmin = await this.roles.findOne({ where: { slug: 'super-admin' } });
    await this.users.save(
      this.users.create({
        email: dto.adminEmail.toLowerCase(),
        name: dto.adminName,
        passwordHash: await argon2.hash(dto.adminPassword),
        locale: dto.locale ?? 'tr',
        emailVerifiedAt: new Date(),
        roles: superAdmin ? [superAdmin] : [],
      }),
    );
    await this.settings.save({ key: 'installed', value: true });
    await this.settings.save({ key: 'panel.defaultLocale', value: dto.locale ?? 'tr' });

    if (dto.keepSampleChannels === false) {
      await this.settings.manager.query(`DELETE FROM channels WHERE category = 'Test'`);
    }
    return { ok: true };
  }
}

@ApiTags('installer')
@Controller('installer')
export class InstallerController {
  constructor(private readonly service: InstallerService) {}

  @Public()
  @Get('status')
  status() {
    return this.service.status();
  }

  @Public()
  @Post()
  @ApiOperation({ summary: 'Create the first admin. Locked after installation.' })
  install(@Body() dto: InstallDto) {
    return this.service.install(dto);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([User, Role, SystemSetting])],
  controllers: [InstallerController],
  providers: [InstallerService],
})
export class InstallerModule {}
