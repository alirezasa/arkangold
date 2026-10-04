// docs/admin-guide/build.mjs
//
// ساخت PDF راهنماهای آموزشی پنل مدیریت (هر ماژول یک فایل) از روی src/*.html
//   ۱) فهرست مطالب از روی data-toc فصل‌ها و عنوان‌های h2[data-toc] ساخته می‌شود
//   ۲) PDF یک‌بار چاپ و صفحه‌ی هر عنوان با نشانگرهای نامرئی (pdf.js) پیدا می‌شود
//   ۳) شماره‌ی صفحه‌ها در فهرست درج و PDF نهایی با سربرگ و پاورقی سازمانی چاپ می‌شود
//
// پیش‌نیاز (در یک پوشه‌ی موقت):  npm i playwright-core pdfjs-dist@4 pdf-lib
// اجرا (همه‌ی ماژول‌ها یا فقط چند فایل):
//   DEPS_DIR=/path/to/that/folder CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
//     node docs/admin-guide/build.mjs [03-accounting ...]
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const depsDir = resolve(process.env.DEPS_DIR ?? '.');
const req = createRequire(join(depsDir, 'package.json'));
const pw = await import(pathToFileURL(req.resolve('playwright-core')).href);
const chromium = pw.chromium ?? pw.default.chromium;
const { PDFDocument } = await import(pathToFileURL(req.resolve('pdf-lib')).href);
const pdfjs = await import(
  pathToFileURL(join(dirname(req.resolve('pdfjs-dist/package.json')), 'legacy/build/pdf.mjs')).href
);

const srcDir = join(here, 'src');
const outDir = join(here, 'pdf');
mkdirSync(outDir, { recursive: true });

const only = process.argv.slice(2);
const files = readdirSync(srcDir)
  .filter((f) => f.endsWith('.html'))
  .filter((f) => !only.length || only.some((o) => f.startsWith(o)))
  .sort();

const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

const hfCss = `
  <style>
    .hf { font-family: Dana, Tahoma, sans-serif; font-size: 7.6pt; color: #6b6461; width: 100%;
          margin: 0 16mm; direction: rtl; display: flex; justify-content: space-between; align-items: center;
          -webkit-print-color-adjust: exact; }
    .hf b { color: #330509; }
    .hf .g { color: #9a7a2c; }
    .hd { border-bottom: 0.6pt solid #c5a059; padding-bottom: 1.2mm; margin-top: 2mm; }
    .ft { border-top: 0.6pt solid #e2e0d8; padding-top: 1.2mm; }
    .pg { background: #330509; color: #c5a059; border-radius: 3mm; padding: 0.3mm 2.6mm; font-weight: 700; }
  </style>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });

for (const file of files) {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(join(srcDir, file)).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);

  const meta = await page.evaluate(() => ({
    title: document.querySelector('meta[name="guide-title"]')?.content ?? document.title,
    num: document.querySelector('meta[name="guide-num"]')?.content ?? '',
  }));

  const headerTemplate = `${hfCss}<div class="hf hd"><span><b>آرکان گلد</b> — راهنمای آموزشی پنل مدیریت</span><span class="g">ماژول ${meta.num} · ${meta.title}</span></div>`;
  const footerTemplate = `${hfCss}<div class="hf ft"><span>سند داخلی — ویژه‌ی کارکنان آرکان گلد</span><span class="pg"><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;

  // ── ساخت فهرست و نشانگرها ──
  const entries = await page.evaluate(() => {
    const list = [];
    const toc = document.getElementById('toc-list');
    if (!toc) return list;
    document.querySelectorAll('section.chapter').forEach((ch, ci) => {
      const title = `${(ci + 1).toLocaleString('fa-IR')}. ${ch.dataset.toc}`;
      list.push({ level: 'ch', title, key: `QQK${list.length}KQQ` });
      ch.querySelector('.chapter-head h1').insertAdjacentHTML('beforeend', `<span class="marker">${list[list.length - 1].key}</span>`);
      ch.querySelectorAll('h2[data-toc]').forEach((h) => {
        list.push({ level: 'sec', title: h.textContent.trim(), key: `QQK${list.length}KQQ` });
        h.insertAdjacentHTML('beforeend', `<span class="marker">${list[list.length - 1].key}</span>`);
      });
    });
    toc.innerHTML = list
      .map((e, i) => `<li class="${e.level}"><span class="t">${e.title}</span><span class="p" id="tocp${i}">۰۰</span></li>`)
      .join('');
    if (list.length > 34) toc.classList.add('cols');
    return list;
  });

  const pdfOptions = {
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate,
    footerTemplate,
  };

  // ── گذر اول: یافتن صفحه‌ی هر عنوان ──
  const draft = await page.pdf(pdfOptions);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(draft), useSystemFonts: false }).promise;
  const pageOf = new Map();
  for (let p = 1; p <= doc.numPages; p++) {
    const text = (await (await doc.getPage(p)).getTextContent()).items
      .map((i) => i.str)
      .join('')
      .replace(/\s+/g, '');
    for (const m of text.matchAll(/QQK(\d+)KQQ/g)) if (!pageOf.has(m[1])) pageOf.set(m[1], p);
  }
  const missing = entries.filter((_, i) => !pageOf.has(String(i)));
  if (missing.length) console.warn(`${file}: عنوان‌های بدون صفحه:`, missing.map((m) => m.title));

  // ── گذر دوم: درج شماره‌ها و چاپ نهایی ──
  await page.evaluate(
    (map) => {
      for (const [i, p] of Object.entries(map)) {
        const el = document.getElementById(`tocp${i}`);
        if (el) el.textContent = p;
      }
    },
    Object.fromEntries([...pageOf].map(([i, p]) => [i, fa(p)])),
  );
  // جلد بدون سربرگ و پاورقی، بقیه‌ی صفحه‌ها با سربرگ و پاورقی؛ سپس ادغام
  const coverPdf = await page.pdf({ ...pdfOptions, displayHeaderFooter: false, pageRanges: '1' });
  const bodyPdf = await page.pdf({ ...pdfOptions, pageRanges: `2-${doc.numPages}` });
  const merged = await PDFDocument.create();
  for (const bytes of [coverPdf, bodyPdf]) {
    const src = await PDFDocument.load(bytes);
    for (const pg of await merged.copyPages(src, src.getPageIndices())) merged.addPage(pg);
  }
  merged.setTitle(`${meta.title} — راهنمای پنل مدیریت آرکان گلد`);
  merged.setAuthor('آرکان گلد');
  const final = await merged.save();
  const outPdf = join(outDir, file.replace(/\.html$/, '.pdf'));
  writeFileSync(outPdf, final);
  console.log(`${file} → ${outPdf.replace(`${here}/`, '')} — ${doc.numPages} صفحه، ${entries.length} عنوان`);
  await page.close();
}
await browser.close();
