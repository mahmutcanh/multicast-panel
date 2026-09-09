import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditService } from './audit.service';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// Routes that are noisy or carry credentials — never audited with body.
const SKIP_PREFIXES = ['/api/v1/auth/login', '/api/v1/auth/refresh', '/api/v1/auth/mfa'];
const SENSITIVE_KEYS = ['password', 'passwordhash', 'token', 'secret', 'licensekey'];

function sanitize(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object') return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEYS.some((s) => k.toLowerCase().includes(s)) ? '[redacted]' : v;
  }
  return out;
}

/** Records every successful mutating request into audit_logs. */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    if (!MUTATING.has(req.method) || SKIP_PREFIXES.some((p) => req.url.startsWith(p))) {
      return next.handle();
    }
    return next.handle().pipe(
      tap(() => {
        const parts = (req.route?.path ?? req.url).split('/').filter(Boolean);
        void this.audit.record({
          userId: req.user?.id ?? null,
          userEmail: req.user?.email ?? '',
          action: `${req.method} ${req.route?.path ?? req.url}`,
          resource: parts[2] ?? 'unknown',
          resourceId: req.params?.id ?? null,
          ip: req.ip,
          meta: sanitize(req.body),
        });
      }),
    );
  }
}
