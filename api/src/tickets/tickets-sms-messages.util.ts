// api/src/tickets/tickets-sms-messages.util.ts
import { TicketStatus } from '@arkan-gold/shared';

const SIGNATURE = 'آرکان گلد';

export function ticketCreatedSmsText(
  ticketNumber: string,
  subject: string,
): string {
  return `تیکت شما با شماره ${ticketNumber} با موضوع «${subject}» با موفقیت ثبت شد. ${SIGNATURE}`;
}

export function ticketAdminReplySmsText(ticketNumber: string): string {
  return `پاسخ جدیدی برای تیکت ${ticketNumber} شما ثبت شد. برای مشاهده به پنل کاربری مراجعه کنید. ${SIGNATURE}`;
}

const STATUS_CHANGE_TEXT: Record<TicketStatus, string> = {
  [TicketStatus.OPEN]: 'وضعیت تیکت {n} شما به «باز» تغییر کرد.',
  [TicketStatus.IN_PROGRESS]: 'تیکت {n} شما توسط کارشناس در حال بررسی است.',
  [TicketStatus.WAITING_FOR_USER]: 'پاسخ جدیدی برای تیکت {n} شما ثبت شد.',
  [TicketStatus.RESOLVED]:
    'تیکت {n} شما حل‌شده علامت‌گذاری شد. در صورت نیاز تا ۷ روز می‌توانید بازگشایی کنید.',
  [TicketStatus.CLOSED]: 'تیکت {n} شما بسته شد.',
  [TicketStatus.REOPENED]: 'تیکت {n} شما مجدداً بازگشایی شد.',
};

export function ticketStatusChangedSmsText(
  ticketNumber: string,
  status: TicketStatus,
): string {
  return `${STATUS_CHANGE_TEXT[status].replace('{n}', ticketNumber)} ${SIGNATURE}`;
}

export function ticketAssignedAdminSmsText(
  ticketNumber: string,
  subject: string,
): string {
  return `تیکت جدید ${ticketNumber} («${subject}») به شما ارجاع داده شد. ${SIGNATURE}`;
}

export function ticketNewUserMessageAdminSmsText(ticketNumber: string): string {
  return `پیام جدیدی از کاربر در تیکت ${ticketNumber} ثبت شد. ${SIGNATURE}`;
}
