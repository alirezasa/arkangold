#!/usr/bin/env node
// کپی کامل داده‌های دیتابیس لیارا در دیتابیس رانفلر — بدون pg_dump و بدون نصب چیزی روی سیستم خودتان.
//
// روی کنسول سرویس api رانفلر اجرا می‌شود؛ مقصد همان DATABASE_URL سرویس است و فقط دیتابیس لیارا باید
// دسترسی عمومی داشته باشد:
//
//   SOURCE_DATABASE_URL='postgresql://...آدرس عمومی لیارا...' node scripts/migrate/db-copy.mjs
//
// روند:
//   ۱. اگر دیتابیس مقصد هنوز جدول ندارد، migrationهای Prisma روی آن اجرا می‌شود (ساختار جدول‌ها)
//   ۲. migrationهای مبدأ و مقصد مقایسه می‌شوند (مقصد باید همه‌ی migrationهای مبدأ را داشته باشد)
//   ۳. در یک تراکنش روی مقصد: کلیدهای خارجی موقتاً برداشته می‌شوند، جدول‌ها خالی و ردیف‌ها از یک
//      snapshot ثابت مبدأ کپی می‌شوند، کلیدهای خارجی دوباره ساخته (و بررسی) می‌شوند، شمارنده‌ها (sequence)
//      تنظیم و تعداد ردیف‌های همه‌ی جدول‌ها مقایسه می‌شود. فقط اگر همه یکسان باشد commit می‌شود؛ در هر
//      خطایی rollback می‌شود و مقصد دست‌نخورده می‌ماند.
//
// اگر مقصد از قبل داده دارد، فقط با --replace اجرا می‌شود (داده‌ی فعلی مقصد با داده‌ی لیارا جایگزین می‌شود).
// مبدأ فقط خوانده می‌شود و هیچ تغییری در آن داده نمی‌شود؛ اجرای دوباره امن است.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const API_DIR = join(ROOT, 'api');
const BATCH_ROWS = 1000;
const SCHEMA = 'public';
const MIGRATIONS_TABLE = '_prisma_migrations';

const requireFromApi = createRequire(join(API_DIR, 'package.json'));
let pg;
try {
  pg = requireFromApi('pg');
} catch {
  fail('پکیج pg پیدا نشد؛ این اسکریپت را روی سرویس api (یا بعد از pnpm install در api) اجرا کنید');
}

function fail(message) {
  console.error(`[migrate] ${message}`);
  process.exit(1);
}

function log(message) {
  console.log(`[migrate] ${message}`);
}

const q = (name) => `"${name.replace(/"/g, '""')}"`;
const table = (name) => `${q(SCHEMA)}.${q(name)}`;

/** آدرس Prisma ممکن است پارامترهایی مثل ?schema=public داشته باشد که PostgreSQL نمی‌شناسد */
function cleanUrl(url, label) {
  if (!url) fail(`${label} تنظیم نشده است`);
  if (/^prisma(\+postgres)?:\/\//.test(url)) fail(`${label}: آدرس Prisma Accelerate قابل استفاده نیست؛ آدرس مستقیم postgresql:// بدهید`);
  if (!/^postgres(ql)?:\/\//.test(url)) fail(`${label} باید با postgresql:// شروع شود`);
  const parsed = new URL(url);
  parsed.searchParams.delete('schema');
  return parsed.toString();
}

async function connect(url, label) {
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
  } catch (error) {
    fail(
      `اتصال به ${label} ناموفق بود: ${error.message}` +
        (/ssl|certificate/i.test(error.message) ? ' (برای SSL بدون بررسی گواهی، ?sslmode=no-verify را به آدرس اضافه کنید)' : ''),
    );
  }
  return client;
}

async function hasTable(client, name) {
  const { rows } = await client.query('select to_regclass($1) is not null as ok', [`${SCHEMA}.${name}`]);
  return rows[0].ok;
}

async function appliedMigrations(client) {
  if (!(await hasTable(client, MIGRATIONS_TABLE))) return null;
  const { rows } = await client.query(
    `select migration_name from ${table(MIGRATIONS_TABLE)} where finished_at is not null and rolled_back_at is null`,
  );
  return new Set(rows.map((r) => r.migration_name));
}

async function listTables(client) {
  const { rows } = await client.query(
    `select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = $1 and c.relkind in ('r', 'p') and c.relname <> $2 order by c.relname`,
    [SCHEMA, MIGRATIONS_TABLE],
  );
  return rows.map((r) => r.name);
}

/** ستون‌های قابل درج (بدون ستون‌های generated) */
async function listColumns(client, name) {
  const { rows } = await client.query(
    `select a.attname as name from pg_attribute a
     where a.attrelid = to_regclass($1) and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
     order by a.attnum`,
    [`${SCHEMA}.${q(name)}`],
  );
  return rows.map((r) => r.name);
}

async function countRows(client, name) {
  const { rows } = await client.query(`select count(*)::bigint as n from ${table(name)}`);
  return BigInt(rows[0].n);
}

function runPrismaMigrate(targetUrl) {
  log('دیتابیس مقصد جدول ندارد؛ اجرای prisma migrate deploy برای ساخت جدول‌ها...');
  const prismaCli = join(API_DIR, 'node_modules', 'prisma', 'build', 'index.js');
  const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: API_DIR,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: targetUrl },
  });
  if (result.status !== 0) fail('prisma migrate deploy روی مقصد شکست خورد');
}

async function main() {
  const replace = process.argv.includes('--replace');
  const unknown = process.argv.slice(2).filter((a) => a !== '--replace');
  if (unknown.length) fail(`گزینه‌ی ناشناخته: ${unknown.join(' ')} (استفاده: node scripts/migrate/db-copy.mjs [--replace])`);

  const sourceUrl = cleanUrl(process.env.SOURCE_DATABASE_URL, 'SOURCE_DATABASE_URL (دیتابیس لیارا)');
  const targetUrl = cleanUrl(process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL, 'TARGET_DATABASE_URL یا DATABASE_URL (دیتابیس رانفلر)');
  const host = (u) => new URL(u).host + new URL(u).pathname;
  if (host(sourceUrl) === host(targetUrl)) fail('مبدأ و مقصد یکی هستند؛ DATABASE_URL این سرویس هنوز به دیتابیس لیارا اشاره می‌کند؟ TARGET_DATABASE_URL را بدهید');

  const source = await connect(sourceUrl, 'دیتابیس لیارا (مبدأ)');
  log(`مبدأ: ${host(sourceUrl)}`);

  let target = await connect(targetUrl, 'دیتابیس رانفلر (مقصد)');
  log(`مقصد: ${host(targetUrl)}`);

  // ۱. ساختار جدول‌ها و مقایسه‌ی migrationها
  const sourceMigrations = await appliedMigrations(source);
  if (!sourceMigrations) fail('جدول _prisma_migrations در مبدأ نیست؛ آدرس مبدأ درست است؟');
  // ردیف‌هایی که خود migrationها درج می‌کنند (مثلاً audit_chain_state) داده‌ی کاربر نیستند
  let freshlyMigrated = false;
  if (!(await appliedMigrations(target))) {
    await target.end();
    runPrismaMigrate(targetUrl);
    target = await connect(targetUrl, 'دیتابیس رانفلر (مقصد)');
    freshlyMigrated = true;
  }
  const targetMigrations = await appliedMigrations(target);
  const missing = [...sourceMigrations].filter((m) => !targetMigrations.has(m));
  if (missing.length) {
    fail(`این migrationهای لیارا در مقصد اعمال نشده‌اند: ${missing.join('، ')} — اول نسخه‌ی کد رانفلر را به‌روز کنید`);
  }
  log(`migrationها: مبدأ ${sourceMigrations.size}، مقصد ${targetMigrations.size} (همه‌ی migrationهای مبدأ در مقصد هست)`);

  const sourceTables = await listTables(source);
  const targetTables = new Set(await listTables(target));
  const missingTables = sourceTables.filter((t) => !targetTables.has(t));
  if (missingTables.length) fail(`این جدول‌ها در مقصد نیستند: ${missingTables.join('، ')}`);

  // ستون‌های مشترک؛ ستونی از مبدأ که در مقصد نباشد یعنی از دست رفتن داده
  const plan = [];
  for (const name of sourceTables) {
    const sourceColumns = await listColumns(source, name);
    const targetColumns = new Set(await listColumns(target, name));
    const lost = sourceColumns.filter((c) => !targetColumns.has(c));
    if (lost.length) fail(`ستون‌های ${lost.join('، ')} جدول ${name} در مقصد نیستند`);
    plan.push({ name, columns: sourceColumns });
  }

  // ۲. مقصد خالی است؟
  const nonEmpty = [];
  for (const name of targetTables) {
    const n = await countRows(target, name);
    if (n > 0n) nonEmpty.push(`${name} (${n})`);
  }
  if (nonEmpty.length && !replace && !freshlyMigrated) {
    fail(
      `دیتابیس مقصد داده دارد: ${nonEmpty.slice(0, 10).join('، ')}${nonEmpty.length > 10 ? ' ...' : ''}\n` +
        '[migrate] اگر api رانفلر با این دیتابیس اجرا شده، بخشی از این‌ها ردیف‌های پیش‌فرضی است که هنگام شروع\n' +
        '[migrate] ساخته می‌شوند. اگر کاربری روی رانفلر داده‌ی واقعی ثبت نکرده، با --replace اجرا کنید تا همه‌ی\n' +
        '[migrate] جدول‌ها با داده‌های لیارا جایگزین شوند',
    );
  }

  // ۳. snapshot ثابت از مبدأ (فقط خواندنی)
  await source.query('begin isolation level repeatable read read only');

  await target.query('begin');
  try {
    const { rows: fks } = await target.query(
      `select con.conrelid::regclass::text as tbl, con.conname as name, pg_get_constraintdef(con.oid) as def
       from pg_constraint con join pg_namespace n on n.oid = con.connamespace
       where con.contype = 'f' and n.nspname = $1`,
      [SCHEMA],
    );
    for (const fk of fks) await target.query(`alter table ${fk.tbl} drop constraint ${q(fk.name)}`);
    log(`${fks.length} کلید خارجی موقتاً برداشته شد`);

    // فقط جدول‌هایی که از مبدأ پر می‌شوند خالی می‌شوند؛ جدول‌هایی که فقط در مقصد هستند دست نمی‌خورند
    await target.query(`truncate ${plan.map((t) => table(t.name)).join(', ')}`);

    let totalRows = 0n;
    for (const { name, columns } of plan) {
      const cols = columns.map(q).join(', ');
      await source.query(`declare rows_cursor no scroll cursor for select row_to_json(t)::text as j from ${table(name)} t`);
      let copied = 0;
      for (;;) {
        const { rows } = await source.query(`fetch ${BATCH_ROWS} from rows_cursor`);
        if (!rows.length) break;
        await target.query(
          `insert into ${table(name)} (${cols}) select ${cols} from json_populate_recordset(null::${table(name)}, $1::json)`,
          [`[${rows.map((r) => r.j).join(',')}]`],
        );
        copied += rows.length;
      }
      await source.query('close rows_cursor');
      totalRows += BigInt(copied);
      if (copied) log(`${name}: ${copied} ردیف`);
    }

    for (const fk of fks) await target.query(`alter table ${fk.tbl} add constraint ${q(fk.name)} ${fk.def}`);
    log(`${fks.length} کلید خارجی دوباره ساخته و بررسی شد`);

    // شمارنده‌ها (autoincrement و شماره‌گذاری اسناد)
    const { rows: sequences } = await source.query(
      'select sequencename as name, last_value from pg_sequences where schemaname = $1',
      [SCHEMA],
    );
    let seqCount = 0;
    for (const seq of sequences) {
      const exists = await target.query('select to_regclass($1) is not null as ok', [`${SCHEMA}.${q(seq.name)}`]);
      if (!exists.rows[0].ok) continue;
      if (seq.last_value === null) await target.query('select setval($1, 1, false)', [`${SCHEMA}.${q(seq.name)}`]);
      else await target.query('select setval($1, $2, true)', [`${SCHEMA}.${q(seq.name)}`, seq.last_value]);
      seqCount++;
    }
    log(`${seqCount} شمارنده تنظیم شد`);

    // مقایسه‌ی تعداد ردیف‌ها پیش از commit
    const mismatches = [];
    for (const { name } of plan) {
      const [a, b] = [await countRows(source, name), await countRows(target, name)];
      if (a !== b) mismatches.push(`${name}: لیارا ${a}، رانفلر ${b}`);
    }
    if (mismatches.length) throw new Error(`تعداد ردیف‌ها یکسان نیست: ${mismatches.join(' | ')}`);

    await target.query('commit');
    log(`پایان: ${plan.length} جدول و ${totalRows} ردیف کپی شد و تعداد ردیف همه‌ی جدول‌ها با لیارا یکسان است`);
  } catch (error) {
    await target.query('rollback').catch(() => {});
    fail(`خطا؛ هیچ تغییری در دیتابیس رانفلر ذخیره نشد: ${error.message}`);
  } finally {
    await source.query('rollback').catch(() => {});
    await source.end().catch(() => {});
    await target.end().catch(() => {});
  }
}

main().catch((error) => fail(`خطا: ${error?.message ?? error}`));
