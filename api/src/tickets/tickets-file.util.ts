// api/src/tickets/tickets-file.util.ts
//
// اعتبارسنجی و پاک‌سازی پیوست‌ها به FileSecurityService منتقل شد
// (common/file-security — سیاست TICKET_ATTACHMENT_POLICY).

export const TICKET_MAX_FILES_PER_UPLOAD = Number(
  process.env.TICKET_MAX_FILES_PER_UPLOAD ?? 5,
);
