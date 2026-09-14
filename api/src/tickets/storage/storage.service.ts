// api/src/tickets/storage/storage.service.ts
// Interface انتزاعی — در آینده می‌توان پیاده‌سازی‌های دیگر (R2, MinIO, Wasabi, ...) را
// بدون تغییر در TicketsService جایگزین کرد. فقط باید همین قرارداد را پیاده کنند.

export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');

export interface UploadFileParams {
  key: string;
  buffer: Buffer;
  mimeType: string;
}

export interface IStorageService {
  upload(params: UploadFileParams): Promise<{ storageKey: string }>;
  getSignedDownloadUrl(
    storageKey: string,
    expiresInSeconds?: number,
  ): Promise<string>;
  delete(storageKey: string): Promise<void>;
}
