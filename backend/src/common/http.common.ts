import {
  ArgumentsHost,
  CallHandler,
  Catch,
  ExceptionFilter,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Response } from 'express';
import { Observable, map } from 'rxjs';

/** Consistent API envelope: { success, data, error, meta } */
export interface ApiEnvelope<T = unknown> {
  success: boolean;
  data: T | null;
  error: string | null;
  meta?: Record<string, unknown>;
}

@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiEnvelope> {
    return next.handle().pipe(
      map((body) => {
        // Controllers may return { data, meta } to attach pagination meta,
        // or raw data. Streams/files bypass interceptors entirely.
        if (body && typeof body === 'object' && '__raw' in body) {
          return (body as { __raw: ApiEnvelope }).__raw;
        }
        if (body && typeof body === 'object' && 'data' in body && 'meta' in body) {
          const b = body as { data: unknown; meta: Record<string, unknown> };
          return { success: true, data: b.data, error: null, meta: b.meta };
        }
        return { success: true, data: body ?? null, error: null };
      }),
    );
  }
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<{ method: string; url: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      message =
        typeof body === 'string'
          ? body
          : Array.isArray((body as { message?: unknown }).message)
            ? ((body as { message: string[] }).message ?? []).join('; ')
            : ((body as { message?: string }).message ?? exception.message);
    } else if (exception instanceof Error) {
      // Never leak internals to the client; log full detail server-side.
      this.logger.error(`${req.method} ${req.url} → ${exception.message}`, exception.stack);
    }

    res.status(status).json({ success: false, data: null, error: message });
  }
}

export class PaginationDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500)
  limit: number = 25;

  @IsOptional() @IsString()
  search?: string;
}

export function paginated<T>(items: T[], total: number, dto: PaginationDto) {
  return {
    data: items,
    meta: { total, page: dto.page, limit: dto.limit, pages: Math.ceil(total / dto.limit) },
  };
}
