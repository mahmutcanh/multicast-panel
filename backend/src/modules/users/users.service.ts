import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { In, Repository } from 'typeorm';
import { Role, User } from '../../database/entities/auth.entities';
import { AuthService } from '../auth/auth.service';

export interface UpsertUserInput {
  email?: string;
  name?: string;
  password?: string;
  locale?: string;
  isActive?: boolean;
  roleIds?: string[];
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Role) private readonly roles: Repository<Role>,
    private readonly auth: AuthService,
  ) {}

  async list(page: number, limit: number, search?: string) {
    const qb = this.users
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.roles', 'roles')
      .orderBy('u.createdAt', 'DESC');
    if (search) qb.where('u.email ILIKE :s OR u.name ILIKE :s', { s: `%${search}%` });
    const [items, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
    return { items, total };
  }

  async get(id: string): Promise<User> {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(input: UpsertUserInput): Promise<User> {
    if (!input.email || !input.password || !input.name) {
      throw new BadRequestException('email, name and password are required');
    }
    const existing = await this.users.findOne({ where: { email: input.email.toLowerCase() } });
    if (existing) throw new ConflictException('Email already in use');

    const user = this.users.create({
      email: input.email.toLowerCase(),
      name: input.name,
      locale: input.locale ?? 'tr',
      isActive: input.isActive ?? true,
      passwordHash: await argon2.hash(input.password),
      roles: input.roleIds?.length ? await this.roles.findBy({ id: In(input.roleIds) }) : [],
    });
    const saved = await this.users.save(user);
    void this.auth.sendVerificationEmail(saved);
    return this.get(saved.id);
  }

  async update(id: string, input: UpsertUserInput): Promise<User> {
    const user = await this.get(id);
    if (input.email && input.email.toLowerCase() !== user.email) {
      const dup = await this.users.findOne({ where: { email: input.email.toLowerCase() } });
      if (dup) throw new ConflictException('Email already in use');
      user.email = input.email.toLowerCase();
      user.emailVerifiedAt = null;
    }
    if (input.name !== undefined) user.name = input.name;
    if (input.locale !== undefined) user.locale = input.locale;
    if (input.isActive !== undefined) user.isActive = input.isActive;
    if (input.password) user.passwordHash = await argon2.hash(input.password);
    if (input.roleIds) user.roles = await this.roles.findBy({ id: In(input.roleIds) });
    await this.users.save(user);
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    const user = await this.get(id);
    const isSuperAdmin = (user.roles ?? []).some((r) => r.slug === 'super-admin');
    if (isSuperAdmin) {
      const superAdmins = await this.users
        .createQueryBuilder('u')
        .innerJoin('u.roles', 'r', 'r.slug = :slug', { slug: 'super-admin' })
        .getCount();
      if (superAdmins <= 1) throw new BadRequestException('Cannot delete the last Super Admin');
    }
    await this.users.remove(user);
  }
}
