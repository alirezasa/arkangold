// api/src/shop-labels/label-defaults.ts
//
// اندازه‌های رایج رول برچسب دستگاه‌های لیبل پرینتر حرارتی و سه طرح آماده که در اولین اجرا
// ساخته می‌شوند. ادمین می‌تواند همه را ویرایش، غیرفعال یا حذف کند.
import type { LabelElement, TextElement } from './label-elements';

export const DEFAULT_LABEL_SIZES = [
  { key: 'A6', name: 'پستی A6 — ۱۰۰×۱۵۰', widthMm: 100, heightMm: 150 },
  { key: '100x100', name: '۱۰۰×۱۰۰', widthMm: 100, heightMm: 100 },
  { key: '100x50', name: '۱۰۰×۵۰', widthMm: 100, heightMm: 50 },
  { key: '80x50', name: '۸۰×۵۰', widthMm: 80, heightMm: 50 },
  { key: '60x40', name: '۶۰×۴۰', widthMm: 60, heightMm: 40 },
  { key: '50x30', name: '۵۰×۳۰ (برچسب کالا)', widthMm: 50, heightMm: 30 },
  { key: '40x30', name: '۴۰×۳۰', widthMm: 40, heightMm: 30 },
] as const;

type SizeKey = (typeof DEFAULT_LABEL_SIZES)[number]['key'];

const text = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  content: string,
  fontSize: number,
  extra: Partial<Omit<TextElement, 'type'>> = {},
): TextElement => ({
  id,
  type: 'text',
  x,
  y,
  w,
  h,
  content,
  fontSize,
  bold: false,
  align: 'right',
  valign: 'top',
  dir: 'rtl',
  invert: false,
  border: false,
  ...extra,
});

const line = (id: string, x: number, y: number, w: number): LabelElement => ({
  id,
  type: 'line',
  x,
  y,
  w,
  h: 0.4,
  thickness: 0.4,
});

export const DEFAULT_LABEL_TEMPLATES: {
  name: string;
  description: string;
  repeat: 'ORDER' | 'ITEM' | 'UNIT';
  sizeKey: SizeKey;
  isDefault: boolean;
  elements: LabelElement[];
}[] = [
  {
    name: 'برچسب ارسال — آدرس و بارکد کالا',
    description:
      'برای هر ردیف سفارش یک برچسب: فرستنده، گیرنده و نشانی، مشخصات خریدار و بارکد EAN-13 کالا',
    repeat: 'ITEM',
    sizeKey: '100x100',
    isDefault: true,
    elements: [
      text(
        'sender',
        3,
        2.5,
        94,
        5,
        'فرستنده: {{sender.name}}  {{sender.phone}}',
        8,
      ),
      line('l1', 3, 8.5, 94),
      text('receiver', 3, 10, 94, 7, 'گیرنده: {{receiver.name}}', 13, {
        bold: true,
      }),
      text('rphone', 50, 17.5, 47, 5.5, 'تلفن: {{receiver.phone}}', 10, {
        bold: true,
      }),
      text('postal', 3, 17.5, 46, 5.5, 'کدپستی: {{address.postalCode}}', 10, {
        bold: true,
        align: 'left',
      }),
      text(
        'address',
        3,
        23.5,
        94,
        16,
        '{{address.province}}، {{address.city}} — {{address.full}}',
        10,
      ),
      text(
        'buyer',
        3,
        40.5,
        94,
        5,
        'خریدار: {{buyer.name}}  {{buyer.phone}}',
        8.5,
      ),
      line('l2', 3, 46.5, 94),
      text(
        'order',
        3,
        48,
        94,
        5,
        'سفارش {{order.number}} — {{order.date}} — {{shipping.method}}',
        8,
      ),
      text(
        'item',
        3,
        54,
        94,
        6,
        '{{item.name}} — {{item.weight}} گرم × {{item.quantity}}',
        10,
        { bold: true },
      ),
      {
        id: 'ean',
        type: 'barcode',
        x: 22,
        y: 61.5,
        w: 56,
        h: 27,
        format: 'EAN13',
        source: '{{item.barcode}}',
        showText: true,
        fontSize: 9,
      },
      text(
        'count',
        3,
        91,
        30,
        5,
        'برچسب {{label.index}} از {{label.count}}',
        7,
        {
          align: 'left',
        },
      ),
    ],
  },
  {
    name: 'برچسب پستی A6 — کل سفارش',
    description:
      'یک برچسب برای هر سفارش با فهرست اقلام، بارکد کدپستی و بارکد شماره سفارش',
    repeat: 'ORDER',
    sizeKey: 'A6',
    isDefault: false,
    elements: [
      text('from-t', 4, 3, 92, 5, 'فرستنده', 8, {
        invert: true,
        bold: true,
        valign: 'middle',
      }),
      text(
        'from',
        4,
        9,
        92,
        11,
        '{{sender.name}} — تلفن {{sender.phone}}\n{{sender.address}} — کدپستی {{sender.postalCode}}',
        8,
      ),
      text('to-t', 4, 22, 92, 5, 'گیرنده', 8, {
        invert: true,
        bold: true,
        valign: 'middle',
      }),
      text('to', 4, 28, 92, 8, '{{receiver.name}}', 15, { bold: true }),
      text('to-phone', 4, 36, 92, 6, 'تلفن: {{receiver.phone}}', 11, {
        bold: true,
      }),
      text(
        'to-addr',
        4,
        43,
        92,
        20,
        '{{address.province}}، {{address.city}} — {{address.full}}',
        11,
      ),
      text('postal-t', 4, 64, 40, 5, 'کدپستی: {{address.postalCode}}', 10, {
        bold: true,
      }),
      {
        id: 'postal-bc',
        type: 'barcode',
        x: 46,
        y: 63,
        w: 50,
        h: 12,
        format: 'CODE128',
        source: '{{address.postalCode}}',
        showText: false,
        fontSize: 8,
      },
      line('l1', 4, 78, 92),
      text(
        'buyer',
        4,
        80,
        92,
        5,
        'خریدار: {{buyer.name}} — {{buyer.phone}}',
        9,
      ),
      {
        id: 'items',
        type: 'items',
        x: 4,
        y: 86,
        w: 92,
        h: 34,
        fontSize: 8.5,
        showWeight: true,
        showBarcode: true,
      },
      line('l2', 4, 121, 92),
      text(
        'ship',
        4,
        122.5,
        92,
        5,
        '{{shipping.method}} — رهگیری: {{shipping.trackingCode}}',
        8,
      ),
      {
        id: 'order-bc',
        type: 'barcode',
        x: 10,
        y: 129,
        w: 80,
        h: 17,
        format: 'CODE128',
        source: '{{order.number}}',
        showText: true,
        fontSize: 8,
      },
    ],
  },
  {
    name: 'برچسب کالا ۵۰×۳۰',
    description: 'برای هر عدد کالا: نام، وزن و بارکد EAN-13',
    repeat: 'UNIT',
    sizeKey: '50x30',
    isDefault: false,
    elements: [
      text('name', 1.5, 1, 47, 4.5, '{{item.name}}', 7, {
        bold: true,
        align: 'center',
      }),
      text(
        'weight',
        1.5,
        5.5,
        47,
        4,
        '{{item.weight}} گرم {{item.karat}}',
        6.5,
        { align: 'center' },
      ),
      {
        id: 'ean',
        type: 'barcode',
        x: 3,
        y: 10,
        w: 44,
        h: 17,
        format: 'EAN13',
        source: '{{item.barcode}}',
        showText: true,
        fontSize: 7,
      },
      text('order', 1.5, 27, 47, 2.8, '{{order.number}}', 5, {
        align: 'center',
        dir: 'ltr',
      }),
    ],
  },
];
