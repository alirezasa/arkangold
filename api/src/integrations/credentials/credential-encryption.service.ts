import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';
import { AuditService } from '../../common/audit/audit.service';
import { VaultClient } from '../../common/secrets/vault-client';

// FCS_COP_EXT.2.2 / 2.3: فقط AEAD — AES-256-GCM (NIST SP 800-38D)
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // ۲۵۶ بیت — FCS_COP_EXT.1.2
const IV_LENGTH = 12; // ۹۶ بیت، اندازه‌ی توصیه‌شده‌ی NIST برای GCM
const TAG_LENGTH = 16; // برچسب کامل ۱۲۸ بیتی؛ برچسب کوتاه‌شده پذیرفته نمی‌شود

/**
 * FCS_COP_EXT.1.3: هر شکستی در رمزنگاری/رمزگشایی (کلید اشتباه، برچسب نامعتبر، داده‌ی
 * دستکاری‌شده، فرمت خراب، زمینه‌ی نادرست) با همین یک خطای کلی و یکسان گزارش می‌شود تا
 * هیچ تمایزی قابل مشاهده برای مهاجم نباشد (جلوگیری از oracle).
 */
export class CryptoOperationError extends Error {
  constructor() {
    super('عملیات رمزنگاری ناموفق بود');
    this.name = 'CryptoOperationError';
  }
}

/** شناسه‌ی کلید برای نسخه‌بندی متن رمز — خلاصه‌ی SHA-256، کلید را افشا نمی‌کند */
function keyIdOf(key: Buffer): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 12);
}

function parseKey(raw: string, name: string): Buffer {
  const key = Buffer.from(raw.trim(), 'base64');
  if (key.length !== KEY_LENGTH) {
    key.fill(0);
    throw new Error(`${name} باید بعد از decode دقیقاً ۳۲ بایت باشد (AES-256)`);
  }
  return key;
}

/**
 * رمزنگاری Credentialهای Provider (Client ID/Secret، API Key و ...).
 *
 * دو backend:
 * - Vault Transit (اگر VAULT_TRANSIT_KEY و VAULT_ADDR تنظیم شده باشند): عملیات رمزنگاری
 *   داخل Vault انجام می‌شود و کلید هرگز وارد حافظه‌ی برنامه نمی‌شود (FCS_CKM_EXT.1.1).
 * - محلی: AES-256-GCM با کلید INTEGRATION_ENCRYPTION_KEY.
 *
 * فرمت متن رمز:
 *   vault:vN:...                        ← Vault Transit
 *   v2:<keyId>:<iv>:<tag>:<ciphertext>  ← محلی، با شناسه‌ی کلید و AAD
 *   <iv>:<tag>:<ciphertext>             ← قدیمی (فقط رمزگشایی؛ با re-encrypt به v2 منتقل می‌شود)
 *
 * هر متن رمز به زمینه‌ی خود (providerId:key) گره خورده است (AAD)؛ جابه‌جا کردن متن رمز
 * یک Credential با دیگری در دیتابیس، در رمزگشایی شکست می‌خورد.
 *
 * چرخش کلید (FCS_CKM_EXT.1.2): کلید فعلی را به INTEGRATION_ENCRYPTION_KEYS_PREVIOUS
 * (فهرست جداشده با کاما) منتقل کنید، کلید جدید را در INTEGRATION_ENCRYPTION_KEY بگذارید،
 * سپس «رمزنگاری مجدد» را از پنل ادمین اجرا کنید و در پایان کلید قبلی را حذف کنید.
 *
 * تولید کلید: openssl rand -base64 32
 */
@Injectable()
export class CredentialEncryptionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CredentialEncryptionService.name);
  private readonly keys = new Map<string, Buffer>();
  private currentKeyId: string | null = null;
  private vault: VaultClient | null = null;
  private transitKey: string | null = null;

  constructor(private readonly auditService: AuditService) {}

  onModuleInit() {
    this.transitKey = process.env.VAULT_TRANSIT_KEY || null;
    if (this.transitKey) {
      this.vault = VaultClient.fromEnv();
      if (!this.vault) {
        throw new Error('VAULT_TRANSIT_KEY تنظیم شده اما VAULT_ADDR تنظیم نشده است');
      }
    }

    const raw = process.env.INTEGRATION_ENCRYPTION_KEY;
    if (raw) {
      const key = parseKey(raw, 'INTEGRATION_ENCRYPTION_KEY');
      this.currentKeyId = keyIdOf(key);
      this.keys.set(this.currentKeyId, key);
    } else if (!this.vault) {
      throw new Error(
        'INTEGRATION_ENCRYPTION_KEY در env تنظیم نشده است. یک کلید ۳۲ بایتی Base64 تولید کن: `openssl rand -base64 32`',
      );
    }

    const previous = (process.env.INTEGRATION_ENCRYPTION_KEYS_PREVIOUS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const rawPrev of previous) {
      const key = parseKey(rawPrev, 'INTEGRATION_ENCRYPTION_KEYS_PREVIOUS');
      this.keys.set(keyIdOf(key), key);
    }

    this.logger.log(
      `رمزنگاری Credential: backend=${this.vault ? 'vault-transit' : 'local-aes-256-gcm'}، تعداد کلید محلی=${this.keys.size}`,
    );
  }

  /** FCS_CKM_EXT.1.3: امحای کلیدها از حافظه با بازنویسی صفر هنگام خاموش شدن برنامه */
  onModuleDestroy() {
    for (const key of this.keys.values()) key.fill(0);
    this.keys.clear();
    this.currentKeyId = null;
  }

  async encrypt(plainText: string, context: string): Promise<string> {
    const plain = Buffer.from(plainText, 'utf8');
    try {
      if (this.vault && this.transitKey) {
        const bound = Buffer.concat([Buffer.from(context, 'utf8'), Buffer.from([0]), plain]);
        try {
          return await this.vault.transitEncrypt(this.transitKey, bound);
        } finally {
          bound.fill(0);
        }
      }

      const key = this.currentKeyId ? this.keys.get(this.currentKeyId) : undefined;
      if (!key || !this.currentKeyId) throw new Error('no current key');
      // FCS_COP_EXT.2.4: IV تصادفی تازه از CSPRNG برای هر رمزنگاری
      const iv = randomBytes(IV_LENGTH);
      const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
      cipher.setAAD(Buffer.from(context, 'utf8'));
      const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
      return [
        'v2',
        this.currentKeyId,
        iv.toString('base64'),
        cipher.getAuthTag().toString('base64'),
        encrypted.toString('base64'),
      ].join(':');
    } catch (err) {
      await this.reportFailure('encrypt', context, err);
      throw new CryptoOperationError();
    } finally {
      plain.fill(0);
    }
  }

  async decrypt(payload: string, context: string): Promise<string> {
    try {
      if (payload.startsWith('vault:')) {
        if (!this.vault || !this.transitKey) throw new Error('vault backend not configured');
        const bound = await this.vault.transitDecrypt(this.transitKey, payload);
        try {
          const sep = bound.indexOf(0);
          if (sep < 0 || bound.subarray(0, sep).toString('utf8') !== context) {
            throw new Error('context mismatch');
          }
          return bound.subarray(sep + 1).toString('utf8');
        } finally {
          bound.fill(0);
        }
      }

      const parts = payload.split(':');
      if (parts[0] === 'v2' && parts.length === 5) {
        const key = this.keys.get(parts[1]);
        if (!key) throw new Error('unknown key id');
        return this.decryptLocal(key, parts[2], parts[3], parts[4], context);
      }
      if (parts.length === 3) {
        // قالب قدیمی بدون AAD و بدون شناسه‌ی کلید: همه‌ی کلیدهای موجود امتحان می‌شوند
        for (const key of this.keys.values()) {
          try {
            return this.decryptLocal(key, parts[0], parts[1], parts[2], null);
          } catch {
            // کلید بعدی
          }
        }
        throw new Error('no key could decrypt legacy payload');
      }
      throw new Error('malformed payload');
    } catch (err) {
      await this.reportFailure('decrypt', context, err);
      throw new CryptoOperationError();
    }
  }

  private decryptLocal(
    key: Buffer,
    ivB64: string,
    tagB64: string,
    dataB64: string,
    context: string | null,
  ): string {
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
      throw new Error('invalid iv/tag length');
    }
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    if (context !== null) decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
    try {
      return out.toString('utf8');
    } finally {
      out.fill(0);
    }
  }

  /** وضعیت backend و کلیدها برای پنل ادمین — فقط شناسه‌ها، هرگز خود کلید */
  status() {
    return {
      backend: this.vault && this.transitKey ? 'vault-transit' : 'local-aes-256-gcm',
      algorithm: ALGORITHM,
      keyBits: KEY_LENGTH * 8,
      ivBits: IV_LENGTH * 8,
      tagBits: TAG_LENGTH * 8,
      transitKey: this.transitKey,
      currentKeyId: this.currentKeyId,
      previousKeyIds: [...this.keys.keys()].filter((k) => k !== this.currentKeyId),
    };
  }

  /** نسخه‌ی کلید متن رمز — برای نمایش وضعیت چرخش در پنل ادمین */
  keyVersionOf(payload: string): string {
    if (payload.startsWith('vault:')) return payload.split(':').slice(0, 2).join(':');
    const parts = payload.split(':');
    if (parts[0] === 'v2' && parts.length === 5) return parts[1];
    return 'legacy';
  }

  /** آیا این متن رمز باید با backend/کلید فعلی دوباره رمز شود؟ */
  needsReencryption(payload: string): boolean {
    if (this.vault && this.transitKey) return !payload.startsWith('vault:');
    const parts = payload.split(':');
    return !(parts[0] === 'v2' && parts.length === 5 && parts[1] === this.currentKeyId);
  }

  /** برای نمایش در Admin Panel — فقط ۴ کاراکتر آخر را نشان می‌دهد (طبق سند: Client ID: ********1234) */
  maskForDisplay(plainText: string): string {
    if (plainText.length <= 4) return '*'.repeat(plainText.length);
    return '*'.repeat(plainText.length - 4) + plainText.slice(-4);
  }

  /** FAU_GEN_EXT.1.8: شکست کنترل امنیتی — جزئیات فقط در لاگ داخلی، نه در پاسخ */
  private async reportFailure(operation: 'encrypt' | 'decrypt', context: string, err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    this.logger.warn(`شکست عملیات ${operation} برای ${context}: ${reason}`);
    await this.auditService.logUser({
      userId: null,
      action: 'security.crypto_failure',
      entityType: 'integration_credential',
      entityId: context,
      source: CredentialEncryptionService.name,
      success: false,
      newValue: { operation, reason },
    });
  }
}
