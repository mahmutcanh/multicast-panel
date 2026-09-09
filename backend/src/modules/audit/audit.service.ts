import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../database/entities/auth.entities';

export interface AuditEntry {
  userId?: string | null;
  userEmail?: string;
  action: string;
  resource: string;
  resourceId?: string | null;
  ip?: string;
  meta?: Record<string, unknown> | null;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>,
  ) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.repo.save(this.repo.create(entry));
  }

  async list(page: number, limit: number, search?: string) {
    const qb = this.repo.createQueryBuilder('a').orderBy('a.created_at', 'DESC');
    if (search) {
      qb.where('a.action ILIKE :s OR a.resource ILIKE :s OR a.user_email ILIKE :s', {
        s: `%${search}%`,
      });
    }
    const [items, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
    return { items, total };
  }
}
