import { cleanProductDescription, sanitizeRichText } from './rich-text.util';

describe('sanitizeRichText', () => {
  it('keeps allowed formatting', () => {
    const html =
      '<h2>عنوان</h2><p style="text-align:center">متن <strong>مهم</strong></p><ul><li>یک</li></ul>';
    expect(sanitizeRichText(html)).toBe(html);
  });

  it('drops scripts, handlers and arbitrary styles', () => {
    expect(
      sanitizeRichText(
        '<p onclick="x()" style="color:red;position:fixed">a<script>alert(1)</script><img src=x onerror=alert(1)></p>',
      ),
    ).toBe('<p>a</p>');
  });

  it('only keeps safe links', () => {
    expect(sanitizeRichText('<a href="https://arkan.gold/a?b=1">x</a>')).toBe(
      '<a href="https://arkan.gold/a?b=1">x</a>',
    );
    expect(sanitizeRichText('<a href="javascript:alert(1)">x</a>')).toBe(
      '<a>x</a>',
    );
    expect(sanitizeRichText('<a href="java&#115;cript:alert(1)">x</a>')).toBe(
      '<a>x</a>',
    );
    expect(sanitizeRichText(`<a href='https://a.b" onmouseover="x'>x</a>`)).toBe(
      '<a>x</a>',
    );
  });

  it('normalizes aliases and balances tags', () => {
    expect(sanitizeRichText('<h1>a</h1><div><b>b</div>')).toBe(
      '<h2>a</h2><p><strong>b</strong></p>',
    );
  });

  it('escapes stray angle brackets', () => {
    expect(sanitizeRichText('<p>1 < 2 > 0</p>')).toBe('<p>1 &lt; 2 &gt; 0</p>');
  });
});

describe('cleanProductDescription', () => {
  it('leaves legacy plain text and empty values untouched', () => {
    expect(cleanProductDescription('وزن: ۵ گرم\nخط دوم')).toBe(
      'وزن: ۵ گرم\nخط دوم',
    );
    expect(cleanProductDescription(undefined)).toBeUndefined();
    expect(cleanProductDescription('')).toBe('');
  });

  it('sanitizes rich text', () => {
    expect(cleanProductDescription('<p>a</p><script>x</script>')).toBe(
      '<p>a</p>',
    );
  });
});
