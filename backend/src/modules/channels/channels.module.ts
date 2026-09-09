import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Channel, ChannelOutput, StreamProcess } from '../../database/entities/streaming.entities';
import { LicenseModule } from '../license/license.module';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';

@Module({
  imports: [TypeOrmModule.forFeature([Channel, ChannelOutput, StreamProcess]), LicenseModule],
  controllers: [ChannelsController],
  providers: [ChannelsService],
  exports: [ChannelsService, TypeOrmModule],
})
export class ChannelsModule {}
