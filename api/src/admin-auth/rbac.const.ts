// api/src/admin-auth/rbac.const.ts

export const ADMIN_PERMISSIONS = [
  {
    key: 'withdrawal.view',
    group: 'wallet',
    description: 'مشاهده درخواست‌های برداشت',
  },
  {
    key: 'withdrawal.approve',
    group: 'wallet',
    description: 'تایید/رد درخواست برداشت',
  },
  {
    key: 'wallet.adjust',
    group: 'wallet',
    description: 'شارژ یا کسر دستی موجودی کیف پول کاربر',
  },

  {
    key: 'legal_profile.view',
    group: 'users',
    description: 'مشاهده پروفایل‌های حقوقی',
  },
  {
    key: 'legal_profile.approve',
    group: 'users',
    description: 'تایید/رد پروفایل حقوقی',
  },
  {
    key: 'users.view',
    group: 'users',
    description: 'مشاهده لیست و جزئیات کاربران',
  },

  {
    key: 'physical_delivery.view',
    group: 'delivery',
    description: 'مشاهده درخواست‌های تحویل فیزیکی',
  },
  {
    key: 'physical_delivery.approve',
    group: 'delivery',
    description: 'تایید/ارسال/تحویل/لغو درخواست تحویل فیزیکی',
  },

  {
    key: 'shop.manage',
    group: 'shop',
    description: 'مدیریت محصولات، دسته‌بندی‌ها و سفارشات فروشگاه',
  },
  { key: 'shop.view', group: 'shop', description: 'مشاهده سفارشات فروشگاه' },

  {
    key: 'transactions.view',
    group: 'wallet',
    description: 'مشاهده تراکنش‌های کاربران',
  },

  {
    key: 'system_config.view',
    group: 'system',
    description: 'مشاهده تنظیمات سیستم',
  },
  {
    key: 'system_config.edit',
    group: 'system',
    description: 'ویرایش تنظیمات سیستم',
  },

  {
    key: 'admin.manage',
    group: 'admin',
    description: 'ایجاد/ویرایش/غیرفعال‌سازی ادمین‌ها و نقش‌ها',
  },
  {
    key: 'admin.audit_log.view',
    group: 'admin',
    description: 'مشاهده گزارش فعالیت ادمین‌ها',
  },

  {
    key: 'payroll.view',
    group: 'payroll',
    description: 'مشاهده پلن‌های پی‌رول و تاریخچه اجرا',
  },
  {
    key: 'payroll.manage',
    group: 'payroll',
    description: 'ایجاد/ویرایش/اجرای پلن‌های پی‌رول',
  },

  {
    key: 'notifications.view',
    group: 'notifications',
    description: 'مشاهده اعلان‌های درج‌شده برای کاربران',
  },
  {
    key: 'notifications.manage',
    group: 'notifications',
    description: 'درج، ویرایش و حذف اعلان‌های کاربران',
  },

  {
    key: 'referral.view',
    group: 'referral',
    description: 'مشاهده دعوت از دوستان و پاداش‌های پرداختی',
  },
  {
    key: 'referral.manage',
    group: 'referral',
    description: 'مدیریت تنظیمات پاداش دعوت و پرداخت دستی پاداش',
  },
  {
    key: 'accounting.view',
    group: 'accounting',
    description: 'مشاهده دفترکل و گزارش‌های مالی',
  },
  {
    key: 'deposit.view',
    group: 'wallet',
    description: 'مشاهده درخواست‌های واریز و رسیدها',
  },
  {
    key: 'deposit.approve',
    group: 'wallet',
    description: 'شروع بررسی، تایید یا رد درخواست واریز',
  },
  {
    key: 'invoice.view',
    group: 'accounting',
    description: 'مشاهده فاکتورها و پیش‌فاکتورها',
  },
  {
    key: 'invoice.manage',
    group: 'accounting',
    description: 'ابطال فاکتور',
  },
  {
    key: 'integrations.view',
    group: 'integrations',
    description: 'مشاهده تنظیمات Integration ها',
  },
  {
    key: 'integrations.manage',
    group: 'integrations',
    description: 'فعال/غیرفعال و Priority بندی Provider ها',
  },
  {
    key: 'integrations.credentials.manage',
    group: 'integrations',
    description: 'مدیریت Credential های Provider',
  },
  {
    key: 'tickets.view',
    group: 'tickets',
    description: 'مشاهده تیکت‌های اختصاص‌یافته به خود',
  },
  {
    key: 'tickets.view_all',
    group: 'tickets',
    description: 'مشاهده تمامی تیکت‌های سیستم',
  },
  {
    key: 'tickets.update',
    group: 'tickets',
    description: 'ویرایش تیکت، تغییر وضعیت، تغییر اولویت و ارسال پاسخ',
  },
  {
    key: 'tickets.assign',
    group: 'tickets',
    description: 'ارجاع و تخصیص تیکت به کارشناسان',
  },
  {
    key: 'tickets.close',
    group: 'tickets',
    description: 'بستن تیکت',
  },
  {
    key: 'tickets.reopen',
    group: 'tickets',
    description: 'بازگشایی مجدد تیکت‌های بسته شده',
  },
  {
    key: 'tickets.manage_categories',
    group: 'tickets',
    description: 'مدیریت دسته‌بندی‌ها و دپارتمان‌های تیکت',
  },

  {
    key: 'hologram.batch.manage',
    group: 'hologram',
    description: 'ایجاد دسته‌های جدید کد هولوگرام و مشاهده خروجی چاپ',
  },
  {
    key: 'hologram.code.view',
    group: 'hologram',
    description: 'مشاهده و جستجوی کدهای هولوگرام',
  },
  {
    key: 'hologram.code.assign',
    group: 'hologram',
    description: 'تخصیص دستی کد هولوگرام به سفارش',
  },
  {
    key: 'hologram.code.revoke',
    group: 'hologram',
    description: 'ابطال کد هولوگرام',
  },
  {
    key: 'hologram.transfer.view',
    group: 'hologram',
    description: 'مشاهده درخواست‌های انتقال مالکیت شمش',
  },
  {
    key: 'hologram.logs.view',
    group: 'hologram',
    description: 'مشاهده لاگ استعلام‌های اصالت‌سنجی',
  },
  {
    key: 'hologram.security.manage',
    group: 'hologram',
    description: 'مدیریت IPهای مسدودشده و تنظیمات امنیتی استعلام هولوگرام',
  },
  {
    key: 'security.crypto.view',
    group: 'security',
    description: 'مشاهده وضعیت رمزنگاری، کلیدها و مدیریت اسرار',
  },
  {
    key: 'security.crypto.manage',
    group: 'security',
    description: 'رمزنگاری مجدد Credentialها و اجرای پاک‌سازی داده‌های منقضی',
  },
] as const;

export type PermissionKey = (typeof ADMIN_PERMISSIONS)[number]['key'];

export const ADMIN_ROLES = [
  {
    key: 'SUPER_ADMIN',
    name: 'مدیر ارشد',
    description: 'دسترسی کامل به تمام بخش‌های پنل',
    isSystem: true,
    // دسترسی کامل - همه permission ها به‌صورت خودکار محاسبه می‌شود، نه لیست دستی
    permissions: 'ALL' as const,
  },
  {
    key: 'FINANCE_ADMIN',
    name: 'مدیر مالی',
    description: 'مدیریت برداشت‌ها، تراکنش‌ها و تحویل فیزیکی طلا',
    isSystem: true,
    permissions: [
      'withdrawal.view',
      'withdrawal.approve',
      'transactions.view',
      'physical_delivery.view',
      'physical_delivery.approve',
      'users.view',
      'accounting.view',
      'deposit.view',
      'deposit.approve',
      'invoice.view',
      'invoice.manage',
      'hologram.code.view',
      'hologram.code.assign',
      'hologram.code.revoke',
      'hologram.transfer.view',
    ] as PermissionKey[],
  },
  {
    key: 'SUPPORT_ADMIN',
    name: 'کارشناس پشتیبانی',
    description:
      'مشاهده اطلاعات کاربران، تراکنش‌ها و پاسخ‌دهی به تیکت‌های اختصاص‌یافته',
    isSystem: true,
    permissions: [
      'users.view',
      'transactions.view',
      'legal_profile.view',
      'physical_delivery.view',
      'shop.view',
      'deposit.view',
      'invoice.view',
      'tickets.view',
      'tickets.update',
    ] as PermissionKey[],
  },
  {
    key: 'SUPPORT_MANAGER',
    name: 'مدیر پشتیبانی',
    description:
      'نظارت بر کلیه تیکت‌ها، تخصیص، بستن/بازگشایی و مدیریت دسته‌بندی‌ها',
    isSystem: true,
    permissions: [
      'users.view',
      'transactions.view',
      'legal_profile.view',
      'physical_delivery.view',
      'shop.view',
      'deposit.view',
      'invoice.view',
      'tickets.view',
      'tickets.view_all',
      'tickets.update',
      'tickets.assign',
      'tickets.close',
      'tickets.reopen',
      'tickets.manage_categories',
      'notifications.view',
      'notifications.manage',
    ] as PermissionKey[],
  },
  {
    key: 'SHOP_ADMIN',
    name: 'مدیر فروشگاه',
    description: 'مدیریت محصولات، دسته‌بندی‌ها و سفارشات فروشگاه',
    isSystem: true,
    permissions: [
      'shop.manage',
      'shop.view',
      'hologram.batch.manage',
      'hologram.code.view',
      'hologram.code.assign',
      'hologram.code.revoke',
      'hologram.transfer.view',
      'hologram.logs.view',
      'hologram.security.manage',
    ] as PermissionKey[],
  },
] as const;
