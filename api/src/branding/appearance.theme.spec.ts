import {
  DEFAULT_THEME_COLORS,
  buildThemeCss,
  normalizeThemeColors,
} from './appearance.theme';
import { validateFontStructure } from '../common/file-security/file-security.service';
import { detectFileKind } from '../common/file-security/file-signature';

describe('appearance theme', () => {
  const noFont = { regular: null, bold: null, version: '1' };

  it('defaults keep the current brand colours', () => {
    const css = buildThemeCss({ ...DEFAULT_THEME_COLORS }, noFont);
    expect(css).toContain('--color-emerald:#330509');
    expect(css).toContain('--color-gold-500:#c5a059');
    expect(css).not.toContain('--color-gold-50:');
    expect(css).not.toContain('@font-face');
    expect(css).toContain(':root.dark{');
  });

  it('ignores invalid / injected values', () => {
    const c = normalizeThemeColors({
      primary: 'red;}</style><script>',
      accent: '#123ABC',
      unknown: '#000000',
    });
    expect(c.primary).toBe(DEFAULT_THEME_COLORS.primary);
    expect(c.accent).toBe('#123abc');
    expect(buildThemeCss(c, noFont)).not.toMatch(/<|script/);
  });

  it('emits @font-face and font stack when a font is uploaded', () => {
    const css = buildThemeCss(
      { ...DEFAULT_THEME_COLORS },
      { regular: 'woff2', bold: 'ttf', version: 'abc' },
    );
    expect(css).toContain('url("/brand/font/regular?v=abc") format("woff2")');
    expect(css).toContain('url("/brand/font/bold?v=abc") format("truetype")');
    expect(css).toContain('--font-sans:"ArkanBrandFont"');
  });
});

describe('font validation', () => {
  function ttf(numTables: number, tableLen: number) {
    const size = 12 + numTables * 16 + numTables * tableLen;
    const b = Buffer.alloc(size);
    b.writeUInt32BE(0x00010000, 0);
    b.writeUInt16BE(numTables, 4);
    for (let i = 0; i < numTables; i++) {
      const rec = 12 + i * 16;
      b.write('tabl', rec, 'ascii');
      b.writeUInt32BE(12 + numTables * 16 + i * tableLen, rec + 8);
      b.writeUInt32BE(tableLen, rec + 12);
    }
    return b;
  }

  it('detects and accepts a structurally valid TTF', () => {
    const b = ttf(3, 8);
    expect(detectFileKind(b)).toBe('ttf');
    expect(validateFontStructure(b, 'ttf')).toBe(b);
  });

  it('rejects a TTF whose tables point outside the file', () => {
    const b = ttf(2, 8);
    b.writeUInt32BE(10_000, 12 + 12);
    expect(() => validateFontStructure(b, 'ttf')).toThrow();
  });

  it('rejects a WOFF2 with a wrong declared length', () => {
    const b = Buffer.alloc(64);
    b.write('wOF2', 0, 'ascii');
    b.writeUInt32BE(999, 8);
    b.writeUInt16BE(5, 12);
    expect(detectFileKind(b)).toBe('woff2');
    expect(() => validateFontStructure(b, 'woff2')).toThrow();
    b.writeUInt32BE(64, 8);
    expect(validateFontStructure(b, 'woff2')).toBe(b);
  });
});
