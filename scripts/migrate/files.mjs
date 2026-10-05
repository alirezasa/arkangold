#!/usr/bin/env node
// انتقال فایل‌ها از لیارا به رانفلر (یک بار، هنگام مهاجرت).
//
// فایل‌های آپلودی API دو جا هستند:
//   ۱. دیسک برنامه‌ی api در مسیر api/uploads (تصاویر محصولات، طرح‌های بسته‌بندی، مدارک حقوقی)
//   ۲. باکت S3 (رسیدهای واریز و پیوست تیکت‌ها)
//
// دیسک‌ها مستقیم به هم دسترسی ندارند؛ برای همین فایل‌های دیسک از طریق همان باکت S3 جابه‌جا می‌شوند:
//   روی لیارا (کنسول برنامه‌ی api):    node scripts/migrate/files.mjs push
//   روی رانفلر (کنسول سرویس api):      node scripts/migrate/files.mjs pull
// و اگر باکت هم عوض می‌شود (روی رانفلر یا هر سیستمی که به هر دو باکت دسترسی دارد):
//   node scripts/migrate/files.mjs copy-bucket
//
// اتصال به باکت با همان متغیرهای برنامه‌ی api است: S3_ENDPOINT، S3_REGION، S3_BUCKET، S3_ACCESS_KEY،
// S3_SECRET_KEY. در copy-bucket این‌ها مقصدند و مبدأ با همین نام‌ها و پیشوند SRC_ داده می‌شود
// (SRC_S3_ENDPOINT، SRC_S3_BUCKET و ...).
//
// اجرای دوباره امن است: فایل‌هایی که با همان اندازه در مقصد هستند دوباره منتقل نمی‌شوند و هیچ
// فایلی در مقصد حذف یا بازنویسی‌شده‌ی ناقص نمی‌ماند.
import { createReadStream, createWriteStream, mkdirSync, readdirSync, renameSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// @aws-sdk/client-s3 وابستگی api است؛ از node_modules همان بسته بارگذاری می‌شود
const requireFromApi = createRequire(join(ROOT, 'api', 'package.json'));
let s3;
try {
  s3 = requireFromApi('@aws-sdk/client-s3');
} catch {
  fail('پکیج @aws-sdk/client-s3 پیدا نشد؛ این اسکریپت را روی سرویس api (یا بعد از pnpm install در api) اجرا کنید');
}
const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, HeadObjectCommand } = s3;

const DEFAULT_DIR = join(ROOT, 'api', 'uploads');
const PREFIX = (process.env.MIGRATION_PREFIX ?? '_migration/uploads/').replace(/^\/+/, '').replace(/\/*$/, '/');

function fail(message) {
  console.error(`[migrate] ${message}`);
  process.exit(1);
}

function log(message) {
  console.log(`[migrate] ${message}`);
}

function formatSize(bytes) {
  return `${(bytes / 1048576).toFixed(2)} MB`;
}

/** ساخت کلاینت S3 از متغیرهای محیطی با پیشوند داده‌شده ('' برای مقصد / باکت فعلی، 'SRC_' برای مبدأ) */
function connect(prefix = '') {
  const env = (name) => (process.env[`${prefix}${name}`] ?? '').trim();
  const missing = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'].filter((n) => !env(n));
  if (missing.length) fail(`متغیرهای محیطی تنظیم نشده‌اند: ${missing.map((n) => prefix + n).join('، ')}`);

  const endpoint = /^https?:\/\//i.test(env('S3_ENDPOINT')) ? env('S3_ENDPOINT') : `https://${env('S3_ENDPOINT')}`;
  // همان تنظیمات StorageService در api: path-style و بدون checksumهای اضافه (لیارا و اکثر S3های غیر AWS)
  const client = new S3Client({
    region: env('S3_REGION') || 'us-east-1',
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: env('S3_ACCESS_KEY'), secretAccessKey: env('S3_SECRET_KEY') },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  return { client, bucket: env('S3_BUCKET'), label: `${endpoint}/${env('S3_BUCKET')}` };
}

async function* listObjects({ client, bucket }, prefix = '') {
  let ContinuationToken;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix || undefined, ContinuationToken }));
    for (const item of page.Contents ?? []) yield item;
    ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (ContinuationToken);
}

async function remoteSize({ client, bucket }, key) {
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return head.ContentLength ?? null;
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound') return null;
    throw error;
  }
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

function localDir(arg) {
  return arg ? resolve(process.cwd(), arg) : DEFAULT_DIR;
}

/** دیسک → باکت (روی لیارا) */
async function push(dirArg) {
  const dir = localDir(dirArg);
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) fail(`پوشه‌ی ${dir} وجود ندارد`);
  const target = connect();
  log(`ارسال ${dir} → ${target.label}/${PREFIX}`);

  let sent = 0, skipped = 0, bytes = 0;
  for (const file of walk(dir)) {
    const key = PREFIX + relative(dir, file).split(sep).join('/');
    const { size } = statSync(file);
    if ((await remoteSize(target, key)) === size) {
      skipped++;
      continue;
    }
    await target.client.send(
      new PutObjectCommand({ Bucket: target.bucket, Key: key, Body: createReadStream(file), ContentLength: size }),
    );
    sent++;
    bytes += size;
    if (sent % 50 === 0) log(`${sent} فایل ارسال شد...`);
  }
  log(`پایان: ${sent} فایل ارسال شد (${formatSize(bytes)})، ${skipped} فایل از قبل در باکت بود`);
}

/** باکت → دیسک (روی رانفلر) */
async function pull(dirArg) {
  const dir = localDir(dirArg);
  const source = connect();
  log(`دریافت ${source.label}/${PREFIX} → ${dir}`);

  let received = 0, skipped = 0, bytes = 0;
  for await (const item of listObjects(source, PREFIX)) {
    const rel = item.Key.slice(PREFIX.length);
    if (!rel || rel.endsWith('/')) continue;
    const file = resolve(dir, ...rel.split('/'));
    if (!file.startsWith(dir + sep)) fail(`کلید نامعتبر در باکت: ${item.Key}`);
    if (statSync(file, { throwIfNoEntry: false })?.size === item.Size) {
      skipped++;
      continue;
    }
    mkdirSync(dirname(file), { recursive: true });
    const { Body } = await source.client.send(new GetObjectCommand({ Bucket: source.bucket, Key: item.Key }));
    // اول در فایل موقت و بعد rename: اگر دریافت نیمه‌کاره بماند فایل ناقص جای اصلی را نمی‌گیرد
    const partial = `${file}.part`;
    await pipeline(Body, createWriteStream(partial));
    renameSync(partial, file);
    received++;
    bytes += item.Size ?? 0;
    if (received % 50 === 0) log(`${received} فایل دریافت شد...`);
  }
  if (received + skipped === 0) fail(`هیچ فایلی زیر ${PREFIX} در باکت نیست؛ ابتدا push را روی لیارا اجرا کنید`);
  log(`پایان: ${received} فایل دریافت شد (${formatSize(bytes)})، ${skipped} فایل از قبل روی دیسک بود`);
}

/** باکت مبدأ (SRC_S3_*) → باکت مقصد (S3_*) */
async function copyBucket() {
  const source = connect('SRC_');
  const target = connect();
  if (source.label === target.label) fail('باکت مبدأ و مقصد یکی هستند');
  log(`کپی ${source.label} → ${target.label}`);

  let copied = 0, skipped = 0, bytes = 0;
  for await (const item of listObjects(source)) {
    if (item.Key.endsWith('/')) continue;
    if ((await remoteSize(target, item.Key)) === item.Size) {
      skipped++;
      continue;
    }
    const object = await source.client.send(new GetObjectCommand({ Bucket: source.bucket, Key: item.Key }));
    await target.client.send(
      new PutObjectCommand({
        Bucket: target.bucket,
        Key: item.Key,
        Body: object.Body,
        ContentLength: object.ContentLength,
        ContentType: object.ContentType,
        Metadata: object.Metadata,
      }),
    );
    copied++;
    bytes += item.Size ?? 0;
    if (copied % 50 === 0) log(`${copied} فایل کپی شد...`);
  }
  log(`پایان: ${copied} فایل کپی شد (${formatSize(bytes)})، ${skipped} فایل از قبل در مقصد بود`);
}

const [command, arg] = process.argv.slice(2);
const commands = { push, pull, 'copy-bucket': copyBucket };
if (!commands[command]) fail('استفاده: node scripts/migrate/files.mjs <push [dir] | pull [dir] | copy-bucket>');
commands[command](arg).catch((error) => fail(`خطا: ${error?.message ?? error}`));
