// docs/accounting/training/build-pdf.mjs
//
// ساخت PDF راهنمای آموزشی حسابداری از روی accounting-training-manual.html
//   ۱) فهرست مطالب از روی data-toc فصل‌ها و عنوان‌ها ساخته می‌شود
//   ۲) PDF یک‌بار چاپ و صفحه‌ی هر عنوان با نشانگرهای نامرئی (pdf.js) پیدا می‌شود
//   ۳) شماره‌ی صفحه‌ها در فهرست درج و PDF نهایی با سربرگ و پاورقی چاپ می‌شود
//
// پیش‌نیاز (در یک پوشه‌ی موقت):  npm i playwright-core pdfjs-dist@4
// اجرا:
//   DEPS_DIR=/path/to/that/folder CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
//     node docs/accounting/training/build-pdf.mjs
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const depsDir = resolve(process.env.DEPS_DIR ?? '.');
const req = createRequire(join(depsDir, 'package.json'));
const pw = await import(pathToFileURL(req.resolve('playwright-core')).href);
const chromium = pw.chromium ?? pw.default.chromium;
const pdfjs = await import(
  pathToFileURL(join(dirname(req.resolve('pdfjs-dist/package.json')), 'legacy/build/pdf.mjs')).href
);

const htmlPath = join(here, 'accounting-training-manual.html');
const outPdf = join(here, 'accounting-training-manual.pdf');

const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

const headerFooterCss = `
  <style>
    .hf { font-family: DanaFaNum, Tahoma, sans-serif; font-size: 7.5pt; color: #8a8f9c; width: 100%;
          padding: 0 17mm; direction: rtl; display: flex; justify-content: space-between; }
    .hf b { color: #b8860b; }
  </style>`;
const headerTemplate = `${headerFooterCss}<div class="hf"><span><b>آرکان گلد</b> — راهنمای جامع حسابداری</span><span>ویژه‌ی حسابداران و واحد مالی</span></div>`;
const footerTemplate = `${headerFooterCss}<div class="hf"><span>داخلی — محرمانه</span><span>صفحه <span class="pageNumber"></span> از <span class="totalPages"></span></span></div>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const page = await browser.newPage();
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);

// ── ساخت فهرست و نشانگرها ──
const entries = await page.evaluate(() => {
  const list = [];
  const toc = document.getElementById('toc-list');
  document.querySelectorAll('section.chapter').forEach((ch, ci) => {
    const title = `${(ci + 1).toLocaleString('fa-IR')}. ${ch.dataset.toc}`;
    list.push({ level: 'ch', title, key: `QQK${list.length}KQQ` });
    ch.querySelector('.chapter-head h1').insertAdjacentHTML(
      'beforeend',
      `<span class="marker">${list[list.length - 1].key}</span>`,
    );
    ch.querySelectorAll('h2[data-toc]').forEach((h) => {
      list.push({ level: 'sec', title: h.textContent.trim(), key: `QQK${list.length}KQQ` });
      h.insertAdjacentHTML(
        'beforeend',
        `<span class="marker">${list[list.length - 1].key}</span>`,
      );
    });
  });
  toc.innerHTML = list
    .map((e, i) => `<li class="${e.level}"><span class="t">${e.title}</span><span class="p" id="tocp${i}">۰۰</span></li>`)
    .join('');
  return list;
});

const pdfOptions = {
  format: 'A4',
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate,
  footerTemplate,
  margin: { top: '22mm', bottom: '20mm', left: '17mm', right: '17mm' },
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
  for (const m of text.matchAll(/QQK(\d+)KQQ/g)) {
    if (!pageOf.has(m[1])) pageOf.set(m[1], p);
  }
}
const missing = entries.filter((_, i) => !pageOf.has(String(i)));
if (missing.length) console.warn('عنوان‌های بدون صفحه:', missing.map((m) => m.title));

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
const final = await page.pdf(pdfOptions);
writeFileSync(outPdf, final);
console.log(`PDF: ${outPdf} — ${doc.numPages} صفحه، ${entries.length} عنوان در فهرست`);
await browser.close();
