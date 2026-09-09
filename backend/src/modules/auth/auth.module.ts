import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsService } from '../../common/events.service';
import { MailService } from '../../common/mail.service';
import { ApiToken, LoginHistory, User } from '../../database/entities/auth.entities';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard, IpAllowlistGuard, PermissionsGuard } from './guards';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([User, LoginHistory, ApiToken]),
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [AuthService, MailService, EventsService, AuthGuard, PermissionsGuard, IpAllowlistGuard],
  exports: [AuthService, MailService, EventsService, AuthGuard, PermissionsGuard, IpAllowlistGuard, JwtModule, TypeOrmModule],
})
export class AuthModule {}
