// api/src/common/logging/pino-logger.service.ts
// لاگر ساخت‌یافته JSON برای کل برنامه — پاسخ به FAU_GEN_EXT.1.3 (فرمت رویدادنگاری
// استاندارد و رایج و قابل‌تحلیل توسط ابزارهای امنیتی/SIEM) برای لاگ‌های عمومی
// برنامه، علاوه بر جدول audit که پیش‌تر ساخت‌یافته بود.
import { LoggerService } from '@nestjs/common';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'arkangold-api' },
  // pino.stdTimeFunctions.isoTime از Date.toISOString() استفاده می‌کند که همیشه UTC است
  timestamp: pino.stdTimeFunctions.isoTime,
});

function lastContext(params: unknown[]): string | undefined {
  const last = params[params.length - 1];
  return typeof last === 'string' ? last : undefined;
}

function toMessage(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export class PinoLoggerService implements LoggerService {
  log(message: unknown, ...optionalParams: unknown[]): void {
    logger.info({ context: lastContext(optionalParams) }, toMessage(message));
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    // امضای رایج NestJS: error(message, trace?, context?)
    const trace = typeof optionalParams[0] === 'string' ? optionalParams[0] : undefined;
    logger.error({ context: lastContext(optionalParams), trace }, toMessage(message));
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    logger.warn({ context: lastContext(optionalParams) }, toMessage(message));
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    logger.debug({ context: lastContext(optionalParams) }, toMessage(message));
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    logger.trace({ context: lastContext(optionalParams) }, toMessage(message));
  }
}
