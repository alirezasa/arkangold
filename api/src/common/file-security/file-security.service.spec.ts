import { sharp } from './sharp';
import * as JSZip from 'jszip';
import { createServer, Server } from 'node:net';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import {
  FileSecurityService,
  FileRejectedError,
  UploadPolicy,
} from './file-security.service';
import { AntivirusService } from './antivirus.service';
import {
  TICKET_ATTACHMENT_POLICY,
  LEGAL_DOCUMENT_POLICY,
} from './upload-policies';
import { inspectZip } from './archive-inspector';
import {
  contentDisposition,
  decodeUploadFilename,
  sanitizeDisplayName,
} from './content-disposition';
import type { SystemConfigService } from '../../system-config/system-config.service';
import type { AuditService } from '../audit/audit.service';

const config = (values: Record<string, string> = {}) =>
  ({
    get: (k: string, d?: string) => Promise.resolve(values[k] ?? d),
    getNumber: (k: string, d: number) =>
      Promise.resolve(values[k] ? Number(values[k]) : d),
  }) as unknown as SystemConfigService;
const audit = {
  logUser: jest.fn(() => Promise.resolve()),
} as unknown as AuditService;
const skipAv = {
  scan: () => Promise.resolve({ status: 'skipped', reason: 'disabled' }),
} as unknown as AntivirusService;

const service = (av: AntivirusService = skipAv, cfg = config()) =>
  new FileSecurityService(av, cfg, audit);

const reason = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof FileRejectedError) return e.reason;
    throw e;
  }
  return 'ACCEPTED';
};

describe('FileSecurityService', () => {
  it('strips EXIF from images and keeps the server-chosen extension', async () => {
    const jpeg = await sharp({
      create: { width: 40, height: 30, channels: 3, background: '#c90' },
    })
      .jpeg()
      .withMetadata({
        exif: { IFD0: { Artist: 'Secret Person', Copyright: 'x' } },
      })
      .toBuffer();
    expect((await sharp(jpeg).metadata()).exif).toBeDefined();
    const out = await service().process(
      { originalname: '../../photo.JPEG', buffer: jpeg },
      LEGAL_DOCUMENT_POLICY,
    );
    expect(out.ext).toBe('jpg');
    expect(out.displayName).toBe('photo.jpg');
    expect((await sharp(out.buffer).metadata()).exif).toBeUndefined();
  });

  it('rejects images over the pixel limit before decoding (pixel flood)', async () => {
    const big = await sharp({
      create: { width: 1100, height: 1000, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();
    const s = service(skipAv, config({ 'upload.max_image_pixels': '1000000' }));
    expect(
      await reason(
        s.process(
          { originalname: 'a.png', buffer: big },
          LEGAL_DOCUMENT_POLICY,
        ),
      ),
    ).toMatch(/IMAGE_(TOO_LARGE|INVALID)/);
  });

  it('rejects content that does not match the extension', async () => {
    const pdf = Buffer.from('%PDF-1.4\n');
    expect(
      await reason(
        service().process(
          { originalname: 'x.png', buffer: pdf },
          LEGAL_DOCUMENT_POLICY,
        ),
      ),
    ).toBe('CONTENT_TYPE_MISMATCH');
    expect(
      await reason(
        service().process(
          { originalname: 'x.exe', buffer: pdf },
          LEGAL_DOCUMENT_POLICY,
        ),
      ),
    ).toBe('INVALID_FILE_EXTENSION');
  });

  it('removes PDF metadata and rejects PDFs with JavaScript', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.setAuthor('Ali Rezaei');
    doc.setCreator('Secret Tool');
    const clean = await service().process(
      { originalname: 'a.pdf', buffer: Buffer.from(await doc.save()) },
      LEGAL_DOCUMENT_POLICY,
    );
    const reloaded = await PDFDocument.load(clean.buffer, {
      updateMetadata: false,
    });
    expect(reloaded.getAuthor()).toBeUndefined();
    expect(reloaded.getCreator()).toBeUndefined();

    const evil = await PDFDocument.create();
    evil.addPage();
    evil.catalog.set(
      PDFName.of('OpenAction'),
      evil.context.obj({ S: 'JavaScript', JS: PDFString.of('app.alert(1)') }),
    );
    expect(
      await reason(
        service().process(
          { originalname: 'e.pdf', buffer: Buffer.from(await evil.save()) },
          LEGAL_DOCUMENT_POLICY,
        ),
      ),
    ).toBe('PDF_ACTIVE_CONTENT');
  });

  const docx = async (extra?: (z: JSZip) => void) => {
    const z = new JSZip();
    z.file('[Content_Types].xml', '<Types/>');
    z.file('word/document.xml', '<w:document/>');
    z.file(
      'docProps/core.xml',
      '<cp:coreProperties><dc:creator>Ali Rezaei</dc:creator></cp:coreProperties>',
    );
    extra?.(z);
    return z.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  };

  it('strips Office document properties and rejects macros', async () => {
    const out = await service().process(
      { originalname: 'r.docx', buffer: await docx() },
      TICKET_ATTACHMENT_POLICY,
    );
    const core = await (
      await JSZip.loadAsync(out.buffer)
    )
      .file('docProps/core.xml')
      .async('string');
    expect(core).not.toContain('Ali Rezaei');
    const macro = await docx((z) => z.file('word/vbaProject.bin', 'x'));
    expect(
      await reason(
        service().process(
          { originalname: 'm.docx', buffer: macro },
          TICKET_ATTACHMENT_POLICY,
        ),
      ),
    ).toBe('OFFICE_ACTIVE_CONTENT');
  });

  it('rebuilds zip archives with sanitized flat names', async () => {
    const z = new JSZip();
    z.file('folder/notes.txt', 'hello');
    z.file(
      'deep/a/b/pic.png',
      await sharp({
        create: { width: 4, height: 4, channels: 3, background: '#000' },
      })
        .png()
        .toBuffer(),
    );
    const out = await service().process(
      {
        originalname: 'a.zip',
        buffer: await z.generateAsync({ type: 'nodebuffer' }),
      },
      TICKET_ATTACHMENT_POLICY,
    );
    const names = Object.keys((await JSZip.loadAsync(out.buffer)).files).sort();
    expect(names).toEqual(['notes.txt', 'pic.png']);
  });

  it('rejects symlinks, traversal, bombs and disallowed entries in archives', async () => {
    const link = new JSZip();
    link.file('link', '/etc/passwd', { unixPermissions: 0o120777 });
    const linkBuf = await link.generateAsync({
      type: 'nodebuffer',
      platform: 'UNIX',
    });
    expect(
      await reason(
        service().process(
          { originalname: 'l.zip', buffer: linkBuf },
          TICKET_ATTACHMENT_POLICY,
        ),
      ),
    ).toBe('ARCHIVE_SYMLINK');

    const slip = new JSZip();
    slip.file('../../evil.txt', 'x', { createFolders: false });
    const slipBuf = await slip.generateAsync({ type: 'nodebuffer' });
    expect(() => inspectZip(slipBuf)).toThrow(/مسیر/);

    const bomb = new JSZip();
    bomb.file('zeros.txt', Buffer.alloc(8 * 1024 * 1024, 0x41));
    const bombBuf = await bomb.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    });
    expect(
      await reason(
        service().process(
          { originalname: 'b.zip', buffer: bombBuf },
          TICKET_ATTACHMENT_POLICY,
        ),
      ),
    ).toBe('ARCHIVE_RATIO');

    const exe = new JSZip();
    exe.file('run.exe', 'MZ');
    expect(
      await reason(
        service().process(
          {
            originalname: 'x.zip',
            buffer: await exe.generateAsync({ type: 'nodebuffer' }),
          },
          TICKET_ATTACHMENT_POLICY,
        ),
      ),
    ).toBe('ARCHIVE_ENTRY_NOT_ALLOWED');
  });

  it('enforces the size limit', async () => {
    const policy: UploadPolicy = { ...TICKET_ATTACHMENT_POLICY, maxBytes: 4 };
    expect(
      await reason(
        service().process(
          { originalname: 'a.txt', buffer: Buffer.from('hello') },
          policy,
        ),
      ),
    ).toBe('FILE_TOO_LARGE');
  });
});

describe('AntivirusService (clamd INSTREAM)', () => {
  let server: Server;
  let port: number;
  const EICAR =
    'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

  beforeAll(async () => {
    server = createServer((socket) => {
      const chunks: Buffer[] = [];
      socket.on('data', (d) => chunks.push(d));
      socket.on('end', () => {
        const all = Buffer.concat(chunks).toString('latin1');
        socket.end(
          all.includes('EICAR')
            ? 'stream: Eicar-Test-Signature FOUND\0'
            : 'stream: OK\0',
        );
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    port = (server.address() as { port: number }).port;
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(port);
  });
  afterAll(() => {
    delete process.env.CLAMAV_HOST;
    delete process.env.CLAMAV_PORT;
    server.close();
  });

  it('detects malware and blocks the upload', async () => {
    const av = new AntivirusService(config());
    expect(await av.scan(Buffer.from('clean text'))).toEqual({
      status: 'clean',
      engine: 'clamav',
    });
    expect((await av.scan(Buffer.from(EICAR))).status).toBe('infected');
    expect(
      await reason(
        service(av).process(
          { originalname: 'v.txt', buffer: Buffer.from(EICAR) },
          TICKET_ATTACHMENT_POLICY,
        ),
      ),
    ).toBe('MALWARE_DETECTED');
  });

  it('fails closed when the scanner is unreachable', async () => {
    process.env.CLAMAV_PORT = '1';
    const av = new AntivirusService(config());
    await expect(av.scan(Buffer.from('x'))).rejects.toMatchObject({
      status: 503,
    });
    process.env.CLAMAV_PORT = String(port);
  });
});

describe('contentDisposition', () => {
  it('decodes multer latin1 filenames to UTF-8 exactly once', () => {
    const persian = 'مدرک شرکت.pdf';
    const asMulter = Buffer.from(persian, 'utf8').toString('latin1');
    expect(decodeUploadFilename(asMulter)).toBe(persian);
    expect(decodeUploadFilename(persian)).toBe(persian);
    expect(decodeUploadFilename('café.pdf')).toBe('café.pdf');
  });

  it('sanitizes names and encodes per RFC 6266/5987', () => {
    expect(sanitizeDisplayName('../../etc/pa"ss\r\nwd.pdf')).toBe('passwd.pdf');
    const h = contentDisposition('گزارش "مالی".exe', 'pdf');
    expect(h).toMatch(
      /^attachment; filename="[\x20-\x7e]+\.pdf"; filename\*=UTF-8''/,
    );
    expect(h).not.toMatch(/[\r\n]/);
    expect(h).toContain('.pdf');
    expect(h).not.toContain('.exe"');
  });
});
