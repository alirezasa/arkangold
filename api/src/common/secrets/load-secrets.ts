// api/src/common/secrets/load-secrets.ts
// لایه‌ی مدیریت اسرار (FCS_CKM_EXT.1.4) — پیش از راه‌اندازی Nest اجرا می‌شود و اسرار را
// به ترتیب اولویت از این منابع بارگذاری می‌کند:
//   ۱. HashiCorp Vault (KV v2)، اگر VAULT_ADDR تنظیم شده باشد
//   ۲. فایل secret با قرارداد Docker/Kubernetes: NAME_FILE=/run/secrets/name
//   ۳. متغیر محیطی / .env (فقط برای توسعه‌ی محلی توصیه می‌شود)
// سپس قوی بودن اسرار JWT را بررسی می‌کند (FCS_COP_EXT.1.2). هیچ مقداری لاگ نمی‌شود.
import { readFileSync } from 'fs';
import { VaultClient } from './vault-client';
import { JWT_KEY_NAMES } from './jwt-keyring';

interface MinimalLogger {
  log(message: string, context?: string): void;
  warn(message: string, context?: string): void;
}

const CONTEXT = 'SecretsLoader';

/**
 * فهرست صریح اسراری که این لایه مدیریت می‌کند. فقط همین نام‌ها از Vault یا فایل خوانده
 * می‌شوند؛ متغیرهای نامرتبط محیط (مثل SSL_CERT_FILE) هرگز تفسیر یا بازنویسی نمی‌شوند.
 */
export const MANAGED_SECRET_NAMES: readonly string[] = [
  ...JWT_KEY_NAMES,
  ...JWT_KEY_NAMES.map((n) => `${n}_PREVIOUS`),
  'DATABASE_URL',
  'INTEGRATION_ENCRYPTION_KEY',
  'INTEGRATION_ENCRYPTION_KEYS_PREVIOUS',
  'REDIS_PASSWORD',
  'S3_ACCESS_KEY',
  'S3_SECRET_KEY',
  'FINOTECH_CLIENT_APP_ID',
  'VAULT_TOKEN',
  'VAULT_SECRET_ID',
];
export type SecretSource = 'vault' | 'file' | 'env' | 'missing';
const secretSources = new Map<string, 'vault' | 'file'>();

/** منبع بارگذاری هر راز (برای نمایش وضعیت در پنل ادمین؛ هرگز مقدار را برنمی‌گرداند) */
export function getSecretSource(name: string): SecretSource {
  return secretSources.get(name) ?? (process.env[name] ? 'env' : 'missing');
}

/** HMAC-SHA256: کلید دست‌کم هم‌اندازه‌ی خروجی تابع درهم‌ساز (۲۵۶ بیت) */
export const MIN_JWT_SECRET_BYTES = 32;

function loadFileSecrets(providedByVault: Set<string>): string[] {
  const loaded: string[] = [];
  for (const name of MANAGED_SECRET_NAMES) {
    const path = process.env[`${name}_FILE`];
    if (!path || providedByVault.has(name)) continue;
    process.env[name] = readFileSync(path, 'utf8').trim();
    secretSources.set(name, 'file');
    loaded.push(name);
  }
  return loaded;
}

async function loadVaultSecrets(): Promise<string[]> {
  const vault = VaultClient.fromEnv();
  if (!vault || process.env.VAULT_KV_DISABLED === 'true') return [];
  const secrets = await vault.readKv(
    process.env.VAULT_KV_MOUNT ?? 'secret',
    process.env.VAULT_KV_PATH ?? 'arkangold/api',
  );
  const loaded: string[] = [];
  for (const [name, value] of Object.entries(secrets)) {
    if (!MANAGED_SECRET_NAMES.includes(name)) continue;
    process.env[name] = value;
    secretSources.set(name, 'vault');
    loaded.push(name);
  }
  return loaded;
}

function validateJwtSecrets(): string[] {
  const problems: string[] = [];
  const seen = new Map<string, string>();
  for (const name of JWT_KEY_NAMES) {
    for (const variant of [name, `${name}_PREVIOUS`]) {
      const value = process.env[variant];
      if (!value) {
        if (variant === name) problems.push(`${variant} تنظیم نشده است`);
        continue;
      }
      if (Buffer.byteLength(value, 'utf8') < MIN_JWT_SECRET_BYTES) {
        problems.push(`${variant} کوتاه‌تر از ${MIN_JWT_SECRET_BYTES} بایت (۲۵۶ بیت) است`);
      }
      const duplicateOf = seen.get(value);
      if (duplicateOf) problems.push(`${variant} با ${duplicateOf} یکسان است؛ هر کاربرد باید کلید مستقل داشته باشد`);
      seen.set(value, variant);
    }
  }
  return problems;
}

export async function loadSecrets(logger: MinimalLogger): Promise<void> {
  const fromVault = await loadVaultSecrets();
  // Vault اولویت دارد؛ فایل فقط نام‌هایی را پر می‌کند که Vault تأمین نکرده
  const fromFiles = loadFileSecrets(new Set(fromVault));
  logger.log(
    `منابع اسرار — Vault: ${fromVault.length} مورد، فایل: ${fromFiles.length} مورد، بقیه از env`,
    CONTEXT,
  );

  const problems = validateJwtSecrets();
  if (problems.length === 0) return;
  const message = `اسرار JWT ناامن‌اند: ${problems.join(' | ')}. تولید کلید: openssl rand -base64 48`;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(message);
  }
  logger.warn(`${message} (در production برنامه اجرا نمی‌شود)`, CONTEXT);
}
