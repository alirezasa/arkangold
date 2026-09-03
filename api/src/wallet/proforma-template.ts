// api/src/wallet/proforma-template.ts
export interface ProformaTemplateData {
  invoiceNumber: string;
  issueDateFa: string;
  companyName: string;
  companyNationalId: string;
  companyEconomicCode: string;
  amountRial: string;
  userFullName: string;
  userNationalCode: string;
  destinationSheba: string;
  destinationOwner: string;
  trackingId: string;
}

// فونت را از فایل محلی بخوانید و base64 کنید (یک‌بار در startup کش کنید)
export function buildProformaHtml(d: ProformaTemplateData, fontBase64: string) {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<style>
  @font-face {
    font-family: 'Vazirmatn';
    src: url('data:font/woff;base64,${fontBase64}') format('woff');
    font-weight: 400 900;
  }
  * { font-family: 'Vazirmatn', sans-serif; box-sizing: border-box; }
  body { padding: 20px; color:#1a1a1a; font-size: 13px; }
  .header { text-align:center; margin-bottom: 20px; border-bottom: 2px solid #064e3b; padding-bottom: 12px; }
  .header h2 { color:#064e3b; margin: 0 0 4px; }
  .meta { display:flex; justify-content:space-between; font-size:11px; color:#555; margin-bottom: 16px; }
  table { width:100%; border-collapse: collapse; margin: 16px 0; }
  th, td { border:1px solid #ddd; padding:10px; text-align: right; font-size: 12px; }
  th { background:#f3f4f0; }
  .highlight { background:#fdf6e7; font-weight:bold; }
  .footer { margin-top: 24px; font-size: 11px; color:#666; line-height: 1.8; }
</style>
</head>
<body>
  <div class="header">
    <h2>${d.companyName}</h2>
    <p>پیش‌فاکتور شماره ${d.invoiceNumber}</p>
  </div>
  <div class="meta">
    <span>تاریخ صدور: ${d.issueDateFa}</span>
    <span>شناسه ملی: ${d.companyNationalId} | کد اقتصادی: ${d.companyEconomicCode}</span>
  </div>

  <table>
    <tr>
      <th>نام و نام‌خانوادگی</th>
      <th>کد ملی</th>
      <th>مبلغ درخواستی (ریال)</th>
      <th>موضوع</th>
    </tr>
    <tr>
      <td>${d.userFullName || '—'}</td>
      <td dir="ltr">${d.userNationalCode || '—'}</td>
      <td>${d.amountRial}</td>
      <td>درخواست واریز وجه جهت شارژ کیف پول تومانی و خرید طلا از طریق پلتفرم ملّی گلد</td>
    </tr>
  </table>

  <table>
    <tr><td style="width:35%">شماره شبای مقصد</td><td dir="ltr">${d.destinationSheba}</td></tr>
    <tr><td>نام صاحب حساب</td><td>${d.destinationOwner}</td></tr>
    <tr class="highlight"><td>شناسه واریز اختصاصی شما</td><td dir="ltr">${d.trackingId}</td></tr>
  </table>

  <div class="footer">
    <p>این پیش‌فاکتور صرفاً به منظور ارائه به بانک و تسهیل فرآیند واریز وجه صادر شده و به منزله فاکتور قطعی یا تعهد به فروش نیست.</p>
    <p>پس از واریز و تکمیل تراکنش بانکی، مبلغ در چرخه پایا به کیف پول تومانی شما افزوده خواهد شد.</p>
  </div>
</body>
</html>`;
}
