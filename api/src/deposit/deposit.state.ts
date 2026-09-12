// api/src/deposit/deposit.state.ts
// ماشین وضعیت واریز — تنها مرجع مجاز بودن انتقال.

import { ConflictException } from '@nestjs/common';

export type DepositStatusValue =
  | 'PENDING_PAYMENT'
  | 'RECEIPT_UPLOADED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED';

const TRANSITIONS: Record<DepositStatusValue, DepositStatusValue[]> = {
  PENDING_PAYMENT: ['RECEIPT_UPLOADED', 'CANCELLED', 'EXPIRED'],
  RECEIPT_UPLOADED: ['UNDER_REVIEW', 'CANCELLED'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED', 'RECEIPT_UPLOADED'],
  REJECTED: ['RECEIPT_UPLOADED'],
  APPROVED: [], // پایانی — اصلاح فقط با MANUAL_ADJUSTMENT و سند معکوس
  CANCELLED: [],
  EXPIRED: [],
};

export const STATUS_LABEL: Record<DepositStatusValue, string> = {
  PENDING_PAYMENT: 'در انتظار پرداخت',
  RECEIPT_UPLOADED: 'رسید ارسال شد',
  UNDER_REVIEW: 'در حال بررسی',
  APPROVED: 'تایید شد',
  REJECTED: 'رد شد',
  CANCELLED: 'لغو شد',
  EXPIRED: 'منقضی شد',
};

export function canTransition(
  from: DepositStatusValue,
  to: DepositStatusValue,
): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * ⚠ همیشه داخل تراکنش و بعد از SELECT ... FOR UPDATE صدا زده شود،
 * روی وضعیتی که تازه از DB خوانده شده — نه روی وضعیت کش‌شده در لایه بالاتر.
 */
export function assertTransition(
  from: DepositStatusValue,
  to: DepositStatusValue,
): void {
  if (!canTransition(from, to)) {
    throw new ConflictException(
      `تغییر وضعیت از «${STATUS_LABEL[from]}» به «${STATUS_LABEL[to]}» مجاز نیست`,
    );
  }
}

export const MAX_REJECTIONS = 3;
