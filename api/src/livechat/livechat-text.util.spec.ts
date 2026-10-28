import {
  containsPhrase,
  keywordScore,
  normalizePersian,
  similarity,
  tokenize,
} from './livechat-text.util';

describe('livechat text utils', () => {
  it('یکسان‌سازی حروف عربی، ارقام، اعراب و نیم‌فاصله', () => {
    expect(normalizePersian('كيف پول ١٢٣ مي‌خواهم!')).toBe(
      'کیف پول 123 میخواهم',
    );
    expect(normalizePersian('طلاً   آبشده؟')).toBe('طلا ابشده');
  });

  it('حذف کلمات پرتکرار و ریشه‌یابی سبک', () => {
    expect(tokenize('چگونه در آرکان گلد ثبت نام کنیم؟')).toEqual([
      'ارکان',
      'گلد',
      'ثبت',
      'نام',
    ]);
    expect(tokenize('شمش‌ها')).toEqual(['شمش']);
    expect(tokenize('اصالت‌سنجی')).toEqual(tokenize('اصالت سنجی'));
    expect(tokenize('اصالت‌سنجی')).toEqual(tokenize('اصالت سنجی'));
  });

  it('پرسش هم‌معنا امتیاز بالا و پرسش بی‌ربط امتیاز پایین می‌گیرد', () => {
    const ref = tokenize('قیمت لحظه‌ای طلا چقدر است؟');
    expect(similarity(tokenize('قیمت طلا چنده'), ref)).toBeGreaterThan(0.55);
    expect(similarity(tokenize('رمز عبورم را فراموش کردم'), ref)).toBeLessThan(
      0.2,
    );
  });

  it('غلط تایپی یک‌حرفی در واژه‌های بلند پذیرفته می‌شود', () => {
    expect(
      similarity(tokenize('اصالت سنجى شمش'), tokenize('اصالت سنجی شمش طلا')),
    ).toBeGreaterThan(0.7);
    expect(similarity(tokenize('اصالط'), tokenize('اصالت'))).toBeGreaterThan(
      0.6,
    );
  });

  it('کلمات کلیدی چندواژه‌ای', () => {
    expect(
      keywordScore(tokenize('میخوام شمشم رو تحویل فیزیکی بگیرم'), [
        'تحویل فیزیکی',
      ]),
    ).toBe(1);
    expect(keywordScore(tokenize('تحویل سفارش'), ['تحویل فیزیکی'])).toBe(0.5);
  });

  it('تشخیص درخواست کارشناس', () => {
    expect(containsPhrase('لطفا وصلم کنید به کارشناس', ['کارشناس'])).toBe(true);
    expect(containsPhrase('کارشناسی ارشد', ['کارشناس'])).toBe(false);
  });
});
