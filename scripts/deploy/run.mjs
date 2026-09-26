#!/usr/bin/env node
// اجراکننده‌ی استقرار مونوریپو روی سرویس‌های Node.js (لیارا و چابکان).
//
// هر سه سرویس (api / app / admin) کل مونوریپو را دریافت می‌کنند و با متغیر محیطی
// APP_SERVICE مشخص می‌شود کدام بسته ساخته و اجرا شود. هر دو پلتفرم به‌ترتیب
// `npm install` → `npm run build` → `npm start` را در ریشه‌ی پروژه اجرا می‌کنند؛
// package.json ریشه این دو اسکریپت را به همین فایل می‌سپارد.
//
//   node scripts/deploy/run.mjs build   ← نصب وابستگی‌های همان سرویس با pnpm و build
//   node scripts/deploy/run.mjs start   ← (api: اجرای migrationها) و بالا آوردن سرور
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SERVICES = ['api', 'app', 'admin'];

const command = process.argv[2];
const service = (process.env.APP_SERVICE ?? '').trim();

function fail(message) {
  console.error(`[deploy] ${message}`);
  process.exit(1);
}

function log(message) {
  console.log(`[deploy] ${message}`);
}

function assertService() {
  if (!SERVICES.includes(service)) {
    fail(
      `متغیر محیطی APP_SERVICE باید یکی از ${SERVICES.join(' | ')} باشد (مقدار فعلی: "${service}"). ` +
        'آن را در تنظیمات برنامه ← متغیرهای محیطی تعریف کنید.',
    );
  }
}

/**
 * دستور اجرای pnpm با همان نسخه‌ی packageManager در package.json ریشه: اگر pnpm سیستم همین نسخه
 * باشد از آن، وگرنه دقیقاً همین نسخه از طریق npx (نسخه‌ی دیگر pnpm ممکن است allowBuilds را نشناسد).
 */
function pnpmCommand() {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const version = /^pnpm@([^+]+)/.exec(pkg.packageManager ?? '')?.[1];
  const probe = spawnSync('pnpm', ['--version'], { encoding: 'utf8', shell: false });
  if (probe.status === 0 && (!version || probe.stdout.trim() === version)) return ['pnpm'];
  return ['npx', '--yes', `pnpm@${version ?? 'latest'}`];
}

// لیارا با دیدن pnpm-lock.yaml در ریشه خودش pnpm نصب و اجرا می‌کند (با yarn و نسخه‌ای خارج از
// کنترل ما) که با فیلد packageManager شکست می‌خورد؛ برای همین .liaraignore فایل قفل ریشه را آپلود
// نمی‌کند و یک کپی از آن با نام دیگر آپلود می‌شود که اینجا پیش از نصب سر جایش برمی‌گردد.
// به‌روزرسانی کپی پس از تغییر وابستگی‌ها: pnpm run lockfile:sync
const LOCKFILE = join(ROOT, 'pnpm-lock.yaml');
const DEPLOY_LOCKFILE = join(ROOT, 'scripts', 'deploy', 'pnpm-lock.deploy.yaml');

function restoreLockfile() {
  if (!existsSync(LOCKFILE) && existsSync(DEPLOY_LOCKFILE)) {
    copyFileSync(DEPLOY_LOCKFILE, LOCKFILE);
    log('pnpm-lock.yaml از scripts/deploy/pnpm-lock.deploy.yaml بازگردانده شد');
  }
}

function run(cmd, args, options = {}) {
  log(`$ ${[cmd, ...args].join(' ')}`);
  const result = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', ...options });
  if (result.status !== 0) {
    fail(`دستور "${[cmd, ...args].join(' ')}" با کد ${result.status ?? result.signal} شکست خورد`);
  }
}

function build(targets) {
  restoreLockfile();
  const [pnpm, ...pnpmArgs] = pnpmCommand();
  const pnpmRun = (args, options) => run(pnpm, [...pnpmArgs, ...args], options);

  // فقط سرویس‌های هدف و بسته‌های workspace که به آن‌ها وابسته‌اند (مثلاً @arkan-gold/shared برای api).
  // اگر pnpm-lock.yaml آپلود شده باشد از آن استفاده می‌شود و در صورت ناهماهنگی به‌روز می‌شود.
  pnpmRun(
    ['install', ...targets.flatMap((t) => ['--filter', `${t}...`]), '--no-frozen-lockfile'],
    // devDependencies (nest cli، typescript، tailwind و ...) برای build لازم‌اند؛ اگر
    // پلتفرم NODE_ENV=production را از قبل تنظیم کرده باشد pnpm آن‌ها را نصب نمی‌کند.
    // CI=true: pnpm بدون ترمینال تعاملی (محیط build) منتظر تأیید نمی‌ماند.
    { env: { ...process.env, NODE_ENV: 'development', CI: 'true' } },
  );

  for (const target of targets) {
    if (target === 'api') {
      pnpmRun(['--filter', '@arkan-gold/shared', 'run', 'build']);
      pnpmRun(['--filter', 'api', 'exec', 'prisma', 'generate']);
    }
    pnpmRun(['--filter', target, 'run', 'build'], {
      env: { ...process.env, NODE_ENV: 'production' },
    });
    log(`build سرویس ${target} کامل شد`);
  }
}

function isBuilt(dir) {
  if (service === 'api') return existsSync(join(dir, 'dist', 'src', 'main.js'));
  return existsSync(join(dir, '.next', 'BUILD_ID'));
}

function start() {
  assertService();
  const serviceDir = join(ROOT, service);
  if (!isBuilt(serviceDir)) {
    // اگر پلتفرم مرحله‌ی build را اجرا نکرده باشد، پیش از start انجامش می‌دهیم
    log('خروجی build پیدا نشد؛ ابتدا build اجرا می‌شود');
    build([service]);
  }

  const port = process.env.PORT || '3000';
  const env = { ...process.env, NODE_ENV: 'production', PORT: port };
  let entry;

  if (service === 'api') {
    if (process.env.PRISMA_MIGRATE_ON_START !== 'false') {
      run(process.execPath, [join(serviceDir, 'node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'deploy'], {
        cwd: serviceDir,
        env,
      });
    }
    entry = [join(serviceDir, 'dist', 'src', 'main.js')];
  } else {
    entry = [join(serviceDir, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', port, '-H', '0.0.0.0'];
  }

  log(`اجرای ${service} روی پورت ${port}`);
  // cwd باید پوشه‌ی سرویس باشد: api فایل‌های آپلود را نسبت به process.cwd() در api/uploads می‌نویسد
  const child = spawn(process.execPath, entry, { cwd: serviceDir, env, stdio: 'inherit' });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => child.kill(signal));
  }
  child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}

if (command === 'build') {
  if (service) {
    assertService();
    build([service]);
  } else {
    // برخی پلتفرم‌ها متغیرهای محیطی را در مرحله‌ی build در اختیار نمی‌گذارند؛ در این حالت هر سه
    // سرویس ساخته می‌شوند و APP_SERVICE در زمان start تعیین می‌کند کدام اجرا شود.
    log('APP_SERVICE در زمان build تنظیم نشده؛ هر سه سرویس ساخته می‌شوند');
    build(SERVICES);
  }
} else if (command === 'start') {
  start();
} else {
  fail('استفاده: node scripts/deploy/run.mjs <build|start>');
}
