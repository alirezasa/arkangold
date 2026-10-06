// api/src/common/file-security/antivirus.service.ts
//
// FPT_RVM_EXT.3.2 — پویش ضدبدافزار فایل‌های دریافتی از منابع نامعتبر با ClamAV (پروتکل INSTREAM
// سرویس clamd روی TCP) پیش از هر پردازش یا ذخیره‌سازی. در صورت شناسایی بدافزار فایل رد و
// رویداد امنیتی ثبت می‌شود. حالت‌ها (تنظیم «upload.antivirus.mode»):
//   required — اگر پویشگر در دسترس نباشد، آپلود رد می‌شود (fail-closed)
//   auto     — (پیش‌فرض) اگر CLAMAV_HOST تنظیم شده باشد مثل required؛ وگرنه بدون پویش با هشدار
//   off      — پویش غیرفعال (فقط برای محیط توسعه)
import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Socket, connect } from 'node:net';
import { SystemConfigService } from '../../system-config/system-config.service';

export type AntivirusMode = 'required' | 'auto' | 'off';

export type ScanResult =
  | { status: 'clean'; engine: 'clamav' }
  | { status: 'infected'; signature: string; engine: 'clamav' }
  | { status: 'skipped'; reason: 'disabled' | 'not_configured' };

const CHUNK = 64 * 1024;

@Injectable()
export class AntivirusService implements OnModuleInit {
  private readonly logger = new Logger(AntivirusService.name);

  constructor(private systemConfig: SystemConfigService) {}

  get host() {
    return process.env.CLAMAV_HOST?.trim() || null;
  }
  get port() {
    return Number(process.env.CLAMAV_PORT) || 3310;
  }
  get timeoutMs() {
    return Number(process.env.CLAMAV_TIMEOUT_MS) || 30_000;
  }

  onModuleInit() {
    if (!this.host) {
      this.logger.warn(
        'CLAMAV_HOST تنظیم نشده؛ فایل‌های آپلودی پویش ضدبدافزار نمی‌شوند (FPT_RVM_EXT.3.2) — سرویس clamd را راه‌اندازی و CLAMAV_HOST را تنظیم کنید',
      );
    }
  }

  async mode(): Promise<AntivirusMode> {
    const v = (
      await this.systemConfig.get('upload.antivirus.mode', 'auto')
    )?.trim();
    return v === 'required' || v === 'off' ? v : 'auto';
  }

  async status() {
    const mode = await this.mode();
    let reachable: boolean | null = null;
    let version: string | null = null;
    if (this.host) {
      try {
        version = (await this.command('zVERSION\0')).trim();
        reachable = true;
      } catch {
        reachable = false;
      }
    }
    return { mode, configured: !!this.host, reachable, version };
  }

  /** پویش بافر؛ در حالت required/auto+configured، در دسترس نبودن پویشگر = رد (fail-closed) */
  async scan(buffer: Buffer): Promise<ScanResult> {
    const mode = await this.mode();
    if (mode === 'off') return { status: 'skipped', reason: 'disabled' };
    if (!this.host) {
      if (mode === 'required')
        throw this.unavailable('پویشگر ضدبدافزار پیکربندی نشده است');
      return { status: 'skipped', reason: 'not_configured' };
    }
    let reply: string;
    try {
      reply = await this.instream(buffer);
    } catch (err) {
      this.logger.error(`پویش ضدبدافزار ناموفق بود: ${(err as Error).message}`);
      throw this.unavailable('پویش امنیتی فایل در حال حاضر ممکن نیست');
    }
    // پاسخ: «stream: OK» یا «stream: Eicar-Signature FOUND» یا «... ERROR»
    const text = reply.replace(/\0/g, '').trim();
    if (/\bOK$/.test(text)) return { status: 'clean', engine: 'clamav' };
    const found = text.match(/:\s*(.+)\s+FOUND$/);
    if (found)
      return { status: 'infected', signature: found[1], engine: 'clamav' };
    this.logger.error(`پاسخ نامعتبر clamd: ${text.slice(0, 200)}`);
    throw this.unavailable('پویش امنیتی فایل در حال حاضر ممکن نیست');
  }

  private unavailable(message: string) {
    return new ServiceUnavailableException({
      message,
      code: 'ANTIVIRUS_UNAVAILABLE',
    });
  }

  private open(): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = connect({ host: this.host, port: this.port });
      socket.setTimeout(this.timeoutMs);
      socket.once('connect', () => resolve(socket));
      socket.once('error', reject);
      socket.once('timeout', () => {
        socket.destroy();
        reject(new Error('clamd timeout'));
      });
    });
  }

  private collect(socket: Socket): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      socket.on('data', (d: Buffer) => chunks.push(d));
      socket.once('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      socket.once('close', () =>
        resolve(Buffer.concat(chunks).toString('utf8')),
      );
      socket.once('error', reject);
      socket.once('timeout', () => {
        socket.destroy();
        reject(new Error('clamd timeout'));
      });
    });
  }

  private async command(cmd: string): Promise<string> {
    const socket = await this.open();
    const reply = this.collect(socket);
    socket.end(cmd);
    return reply;
  }

  private async instream(buffer: Buffer): Promise<string> {
    const socket = await this.open();
    const reply = this.collect(socket);
    socket.write('zINSTREAM\0');
    for (let i = 0; i < buffer.length; i += CHUNK) {
      const chunk = buffer.subarray(i, i + CHUNK);
      const len = Buffer.alloc(4);
      len.writeUInt32BE(chunk.length, 0);
      socket.write(len);
      socket.write(chunk);
    }
    socket.end(Buffer.alloc(4)); // طول صفر = پایان جریان
    return reply;
  }
}
