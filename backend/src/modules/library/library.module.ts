import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VideoFile } from '../../database/entities/media.entities';
import { LibraryController } from './library.controller';
import { LibraryService } from './library.service';

@Module({
  imports: [TypeOrmModule.forFeature([VideoFile])],
  controllers: [LibraryController],
  providers: [LibraryService],
  exports: [LibraryService],
})
export class LibraryModule {}
