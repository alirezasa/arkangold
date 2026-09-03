// api/src/wallet/proforma-pdf.service.ts
import { Injectable } from '@nestjs/common';
import puppeteer from 'puppeteer';

@Injectable()
export class ProformaPdfService {
  async render(html: string): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}
