// api/src/common/file-security/sharp.ts
// sharp در زمان اجرا ماژول CommonJS بدون export پیش‌فرض است، ولی تایپ‌هایش export پیش‌فرض
// اعلام می‌کنند؛ چون این پروژه esModuleInterop ندارد، `import sharp from 'sharp'` به
// `sharp_1.default` (undefined) کامپایل می‌شود. این پوشش هر دو حالت را پشتیبانی می‌کند.
import type SharpFn from 'sharp';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const loaded = require('sharp') as typeof SharpFn & {
  default?: typeof SharpFn;
};

export const sharp: typeof SharpFn = loaded.default ?? loaded;
export type { Metadata } from 'sharp';
