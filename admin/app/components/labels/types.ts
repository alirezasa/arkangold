// admin/app/components/labels/types.ts
//
// ساختار طرح برچسب — هم‌ارز api/src/shop-labels/label-elements.ts
import type { BarcodeFormat } from "./barcode";

export type LabelRepeat = "ORDER" | "ITEM" | "UNIT";

interface Base {
  id: string;
  /** موقعیت و ابعاد به میلی‌متر از گوشه‌ی بالا-چپ */
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface TextElement extends Base {
  type: "text";
  content: string;
  fontSize: number;
  bold: boolean;
  align: "right" | "center" | "left";
  valign: "top" | "middle" | "bottom";
  dir: "rtl" | "ltr";
  invert: boolean;
  border: boolean;
}
export interface BarcodeElement extends Base {
  type: "barcode";
  format: BarcodeFormat;
  source: string;
  showText: boolean;
  fontSize: number;
}
export interface ItemsElement extends Base {
  type: "items";
  fontSize: number;
  showWeight: boolean;
  showBarcode: boolean;
}
export interface LineElement extends Base {
  type: "line";
  thickness: number;
}
export interface BoxElement extends Base {
  type: "box";
  thickness: number;
  radius: number;
  fill: boolean;
}
export interface ImageElement extends Base {
  type: "image";
  src: string;
}
export type LabelElement = TextElement | BarcodeElement | ItemsElement | LineElement | BoxElement | ImageElement;
export type LabelElementType = LabelElement["type"];

export interface LabelSize {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  dpi: number;
  isActive: boolean;
  sortOrder: number;
  templateCount?: number;
}

export interface LabelTemplate {
  id: string;
  name: string;
  description: string | null;
  repeat: LabelRepeat;
  sizeId: string;
  size: LabelSize;
  elements: LabelElement[];
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
}

// ── داده‌ی چاپ (پاسخ POST /admin/shop-labels/print-data) ──

export interface PrintItem {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  weightGrams: string;
  quantity: number;
  karat: string;
  packaging: string | null;
}
export interface PrintOrder {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  paidAt: string | null;
  totalToman: string;
  labelPrintCount: number;
  buyer: { name: string | null; phone: string };
  receiver: { name: string | null; phone: string };
  address: { title: string | null; province: string | null; city: string | null; full: string; postalCode: string | null };
  shipping: { method: string | null; trackingCode: string | null; courierName: string | null } | null;
  items: PrintItem[];
}
export interface PrintData {
  sender: { name: string; phone: string; address: string; postalCode: string };
  orders: PrintOrder[];
  skipped: { id: string; orderNumber: string | null; reason: string }[];
}

export const REPEAT_FA: Record<LabelRepeat, string> = {
  ORDER: "یک برچسب برای هر سفارش",
  ITEM: "یک برچسب برای هر ردیف کالا",
  UNIT: "یک برچسب برای هر عدد کالا",
};

export const ELEMENT_FA: Record<LabelElementType, string> = {
  text: "متن",
  barcode: "بارکد",
  items: "فهرست اقلام",
  line: "خط",
  box: "کادر",
  image: "تصویر / لوگو",
};
