import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinTable,
  ManyToMany,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) name: string;
  @Column({ unique: true }) slug: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ name: 'is_system', default: false }) isSystem: boolean;
  @ManyToMany(() => Permission, { eager: true })
  @JoinTable({
    name: 'role_permissions',
    joinColumn: { name: 'role_id' },
    inverseJoinColumn: { name: 'permission_id' },
  })
  permissions: Permission[];
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

@Entity('permissions')
export class Permission {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) slug: string;
  @Column({ name: 'group_name' }) group: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) email: string;
  @Column({ name: 'password_hash', select: false }) passwordHash: string;
  @Column() name: string;
  @Column({ default: 'tr' }) locale: string;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null;
  @Column({ name: 'mfa_enabled', default: false }) mfaEnabled: boolean;
  @Column({ name: 'mfa_secret', type: 'text', nullable: true, select: false })
  mfaSecret: string | null;
  @Column({ name: 'mfa_recovery_codes', type: 'jsonb', nullable: true, select: false })
  mfaRecoveryCodes: string[] | null;
  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;
  @Column({ name: 'failed_login_count', default: 0 }) failedLoginCount: number;
  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;
  @ManyToMany(() => Role, { eager: true })
  @JoinTable({
    name: 'user_roles',
    joinColumn: { name: 'user_id' },
    inverseJoinColumn: { name: 'role_id' },
  })
  roles: Role[];
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}

@Entity('api_tokens')
export class ApiToken {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'user_id' }) userId: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
  @Column() name: string;
  @Index({ unique: true })
  @Column({ name: 'token_hash', select: false })
  tokenHash: string;
  @Column({ type: 'jsonb', default: () => `'[]'` }) scopes: string[];
  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

@Entity('login_history')
export class LoginHistory {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'user_id', type: 'uuid', nullable: true }) userId: string | null;
  @Column() email: string;
  @Column() ip: string;
  @Column({ name: 'user_agent', type: 'text', nullable: true }) userAgent: string | null;
  @Column() success: boolean;
  @Column({ type: 'text', nullable: true }) reason: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'user_id', type: 'uuid', nullable: true }) userId: string | null;
  @Column({ name: 'user_email', nullable: true }) userEmail: string;
  @Column() action: string;
  @Column() resource: string;
  @Column({ name: 'resource_id', type: 'text', nullable: true }) resourceId: string | null;
  @Column({ nullable: true }) ip: string;
  @Column({ type: 'jsonb', nullable: true }) meta: Record<string, unknown> | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
