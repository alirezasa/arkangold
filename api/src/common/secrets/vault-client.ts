// api/src/common/secrets/vault-client.ts
// کلاینت حداقلی HashiCorp Vault (بدون وابستگی اضافه؛ با fetch داخلی Node).
// - KV v2: خواندن اسرار برنامه در زمان راه‌اندازی (FCS_CKM_EXT.1.4)
// - Transit: رمزنگاری/رمزگشایی داخل Vault، به‌طوری که کلید هرگز وارد حافظه‌ی برنامه نشود (FCS_CKM_EXT.1.1)
// احراز هویت: VAULT_TOKEN یا AppRole (VAULT_ROLE_ID + VAULT_SECRET_ID، با ورود مجدد خودکار پس از انقضای توکن).

interface VaultConfig {
  addr: string;
  token?: string;
  roleId?: string;
  secretId?: string;
  namespace?: string;
}

export class VaultClient {
  private token: string | undefined;

  private constructor(private readonly cfg: VaultConfig) {
    this.token = cfg.token;
  }

  /** اگر VAULT_ADDR تنظیم نشده باشد null برمی‌گرداند (Vault اختیاری است) */
  static fromEnv(): VaultClient | null {
    const addr = process.env.VAULT_ADDR;
    if (!addr) return null;
    return new VaultClient({
      addr: addr.replace(/\/+$/, ''),
      token: process.env.VAULT_TOKEN,
      roleId: process.env.VAULT_ROLE_ID,
      secretId: process.env.VAULT_SECRET_ID,
      namespace: process.env.VAULT_NAMESPACE,
    });
  }

  private async login(): Promise<void> {
    if (!this.cfg.roleId || !this.cfg.secretId) {
      throw new Error('Vault: نه VAULT_TOKEN تنظیم شده و نه AppRole (VAULT_ROLE_ID/VAULT_SECRET_ID)');
    }
    const res = await this.raw('POST', 'auth/approle/login', {
      role_id: this.cfg.roleId,
      secret_id: this.cfg.secretId,
    });
    if (!res.ok) throw new Error(`Vault AppRole login failed: HTTP ${res.status}`);
    const body = (await res.json()) as { auth?: { client_token?: string } };
    if (!body.auth?.client_token) throw new Error('Vault AppRole login: توکن دریافت نشد');
    this.token = body.auth.client_token;
  }

  private raw(method: string, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) headers['X-Vault-Token'] = this.token;
    if (this.cfg.namespace) headers['X-Vault-Namespace'] = this.cfg.namespace;
    return fetch(`${this.cfg.addr}/v1/${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.token) await this.login();
    let res = await this.raw(method, path, body);
    // توکن AppRole منقضی شده → یک‌بار ورود مجدد
    if (res.status === 403 && this.cfg.roleId) {
      await this.login();
      res = await this.raw(method, path, body);
    }
    if (!res.ok) throw new Error(`Vault ${method} ${path}: HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  /** KV v2 — مثلاً readKv('secret', 'arkangold/api') */
  async readKv(mount: string, path: string): Promise<Record<string, string>> {
    const body = await this.request<{ data?: { data?: Record<string, unknown> } }>(
      'GET',
      `${mount}/data/${path}`,
    );
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(body.data?.data ?? {})) {
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  }

  async transitEncrypt(keyName: string, plaintext: Buffer): Promise<string> {
    const body = await this.request<{ data: { ciphertext: string } }>(
      'POST',
      `transit/encrypt/${keyName}`,
      { plaintext: plaintext.toString('base64') },
    );
    return body.data.ciphertext;
  }

  async transitDecrypt(keyName: string, ciphertext: string): Promise<Buffer> {
    const body = await this.request<{ data: { plaintext: string } }>(
      'POST',
      `transit/decrypt/${keyName}`,
      { ciphertext },
    );
    return Buffer.from(body.data.plaintext, 'base64');
  }
}
