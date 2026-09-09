import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Channel,
  StreamLog,
  StreamProcess,
} from '../../database/entities/streaming.entities';
import { StreamTokenService } from './stream-token.service';
import { StreamsController } from './streams.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Channel, StreamProcess, StreamLog])],
  controllers: [StreamsController],
  providers: [StreamTokenService],
  exports: [StreamTokenService],
})
export class StreamsModule {}
