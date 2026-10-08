// admin/app/components/labels/fields.ts
//
// فیلدهای قابل درج در طرح برچسب ({{receiver.name}} و ...)، ساخت فهرست برچسب‌ها از داده‌ی
// سفارش بر اساس «تکرار» طرح، و داده‌ی نمونه برای پیش‌نمایش طراحی.
import { formatJalali } from "@/app/utils/jalali";
import type { LabelRepeat, PrintData, PrintItem, PrintOrder } from "./types";

export const FIELD_GROUPS: { title: string; fields: { key: string; label: string }[] }[] = [
  {
    title: "گیرنده و نشانی",
    fields: [
      { key: "receiver.name", label: "نام گیرنده" },
      { key: "receiver.phone", label: "تلفن گیرنده" },
      { key: "address.province", label: "استان" },
      { key: "address.city", label: "شهر" },
      { key: "address.full", label: "نشانی کامل" },
      { key: "address.postalCode", label: "کدپستی" },
      { key: "address.title", label: "عنوان نشانی" },
    ],
  },
  {
    title: "خریدار",
    fields: [
      { key: "buyer.name", label: "نام خریدار" },
      { key: "buyer.phone", label: "موبایل خریدار" },
    ],
  },
  {
    title: "سفارش و ارسال",
    fields: [
      { key: "order.number", label: "شماره سفارش" },
      { key: "order.date", label: "تاریخ سفارش" },
      { key: "order.itemsCount", label: "تعداد اقلام" },
      { key: "order.totalWeight", label: "وزن کل (گرم)" },
      { key: "order.total", label: "مبلغ سفارش" },
      { key: "shipping.method", label: "مرجع ارسال" },
      { key: "shipping.trackingCode", label: "کد رهگیری" },
      { key: "shipping.courier", label: "نام پیک" },
    ],
  },
  {
    title: "کالا",
    fields: [
      { key: "item.name", label: "نام کالا" },
      { key: "item.weight", label: "وزن (گرم)" },
      { key: "item.quantity", label: "تعداد" },
      { key: "item.karat", label: "عیار" },
      { key: "item.barcode", label: "بارکد EAN-13" },
      { key: "item.sku", label: "کد کالا (SKU)" },
      { key: "item.packaging", label: "بسته‌بندی" },
    ],
  },
  {
    title: "فرستنده",
    fields: [
      { key: "sender.name", label: "نام فرستنده" },
      { key: "sender.phone", label: "تلفن فرستنده" },
      { key: "sender.address", label: "نشانی فرستنده" },
      { key: "sender.postalCode", label: "کدپستی فرستنده" },
    ],
  },
  {
    title: "شمارنده",
    fields: [
      { key: "label.index", label: "شماره برچسب" },
      { key: "label.count", label: "تعداد برچسب‌های سفارش" },
      { key: "print.date", label: "تاریخ چاپ" },
    ],
  },
];

/** منبع‌های پیشنهادی بارکد */
export const BARCODE_SOURCES: { value: string; label: string; format: "EAN13" | "CODE128" }[] = [
  { value: "{{item.barcode}}", label: "بارکد کالا (EAN-13)", format: "EAN13" },
  { value: "{{order.number}}", label: "شماره سفارش", format: "CODE128" },
  { value: "{{address.postalCode}}", label: "کدپستی گیرنده", format: "CODE128" },
  { value: "{{shipping.trackingCode}}", label: "کد رهگیری مرسوله", format: "CODE128" },
  { value: "{{receiver.phone}}", label: "تلفن گیرنده", format: "CODE128" },
];

export type LabelContext = Record<string, string>;

export interface BuiltLabel {
  key: string;
  ctx: LabelContext;
  order: PrintOrder;
}

const fa = (n: number) => n.toLocaleString("fa-IR", { maximumFractionDigits: 3 });

function itemContext(item: PrintItem | undefined): LabelContext {
  if (!item) return {};
  return {
    "item.name": item.name,
    "item.weight": fa(Number(item.weightGrams)),
    "item.quantity": fa(item.quantity),
    "item.karat": item.karat,
    "item.barcode": item.barcode ?? "",
    "item.sku": item.sku ?? "",
    "item.packaging": item.packaging ?? "",
  };
}

function orderContext(order: PrintOrder, sender: PrintData["sender"]): LabelContext {
  const totalWeight = order.items.reduce((s, i) => s + Number(i.weightGrams) * i.quantity, 0);
  return {
    "receiver.name": order.receiver.name ?? "",
    "receiver.phone": order.receiver.phone,
    "address.province": order.address.province ?? "",
    "address.city": order.address.city ?? "",
    "address.full": order.address.full,
    "address.postalCode": order.address.postalCode ?? "",
    "address.title": order.address.title ?? "",
    "buyer.name": order.buyer.name ?? "",
    "buyer.phone": order.buyer.phone,
    "order.number": order.orderNumber,
    "order.date": formatJalali(order.paidAt ?? order.createdAt),
    "order.itemsCount": fa(order.items.reduce((s, i) => s + i.quantity, 0)),
    "order.totalWeight": fa(totalWeight),
    "order.total": `${Math.round(Number(order.totalToman)).toLocaleString("fa-IR")} تومان`,
    "shipping.method": order.shipping?.method ?? "",
    "shipping.trackingCode": order.shipping?.trackingCode ?? "",
    "shipping.courier": order.shipping?.courierName ?? "",
    "sender.name": sender.name,
    "sender.phone": sender.phone,
    "sender.address": sender.address,
    "sender.postalCode": sender.postalCode,
    "print.date": formatJalali(new Date().toISOString()),
  };
}

/** سقف برچسب در یک نوبت چاپ تا مرورگر از صفحه‌ی بسیار بزرگ کند نشود */
export const MAX_LABELS_PER_PRINT = 600;

/** فهرست برچسب‌ها به ترتیب سفارش‌ها؛ copies نسخه از هر برچسب پشت سر هم */
export function buildLabels(data: PrintData, repeat: LabelRepeat, copies = 1): BuiltLabel[] {
  const out: BuiltLabel[] = [];
  for (const order of data.orders) {
    const base = orderContext(order, data.sender);
    const units: { item: PrintItem | undefined; key: string }[] =
      repeat === "ORDER"
        ? [{ item: order.items[0], key: order.id }]
        : repeat === "ITEM"
          ? order.items.map((item) => ({ item, key: item.id }))
          : order.items.flatMap((item) => Array.from({ length: Math.max(1, item.quantity) }, (_, i) => ({ item, key: `${item.id}-${i}` })));
    units.forEach((u, i) => {
      const ctx = { ...base, ...itemContext(u.item), "label.index": fa(i + 1), "label.count": fa(units.length) };
      for (let c = 0; c < copies; c++) {
        if (out.length >= MAX_LABELS_PER_PRINT) return;
        out.push({ key: `${u.key}-${c}`, ctx, order });
      }
    });
  }
  return out;
}

/** جای‌گذاری {{field}} با مقدار؛ فیلد خالی حذف و فاصله‌ها/جداکننده‌های اضافه‌ی ابتدا و انتهای خط پاک می‌شود */
export function fillTemplate(template: string, ctx: LabelContext | null): string {
  if (!ctx) return template;
  return template
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => ctx[key] ?? "")
    .split("\n")
    .map((line) =>
      line
        .replace(/([،,—|-])(?:\s*[،,—|-])+/gu, "$1")
        .replace(/^[\s،,—|-]+/u, "")
        .replace(/[\s،,—|-]+$/u, ""),
    )
    .join("\n");
}

export const SAMPLE_DATA: PrintData = {
  sender: { name: "آرکان گلد", phone: "021-12345678", address: "تهران، خیابان ولیعصر، پلاک ۱۰", postalCode: "1234567890" },
  skipped: [],
  orders: [
    {
      id: "sample",
      orderNumber: "AG-1405-SHO-000128",
      status: "PROCESSING",
      createdAt: new Date().toISOString(),
      paidAt: new Date().toISOString(),
      totalToman: "48500000",
      labelPrintCount: 0,
      buyer: { name: "علی رضایی", phone: "09121234567" },
      receiver: { name: "مریم رضایی", phone: "09129876543" },
      address: {
        title: "منزل",
        province: "تهران",
        city: "تهران",
        full: "سعادت‌آباد، بلوار پاکنژاد، خیابان سی‌وششم، پلاک ۱۲، واحد ۴",
        postalCode: "1998765432",
      },
      shipping: { method: "پست پیشتاز", trackingCode: "123456789012345678901234", courierName: null },
      items: [
        { id: "s1", name: "شمش طلای ۲۴ عیار", sku: "ING-1G", barcode: "2001234567893", weightGrams: "1", quantity: 2, karat: "۲۴ عیار", packaging: "جعبه مخمل" },
        { id: "s2", name: "سکه طلای ۱۸ عیار", sku: "CN-05", barcode: "2009876543213", weightGrams: "0.5", quantity: 1, karat: "۱۸ عیار", packaging: null },
      ],
    },
  ],
};
