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
    key: 'referral.view',
    group: 'referral',
    description: 'مشاهده معرفی‌ها و پاداش‌های پرداختی',
  },
  {
    key: 'referral.manage',
    group: 'referral',
    description: 'مدیریت تنظیمات پاداش معرفی',
  },
  {
    key: 'accounting.view',
    group: 'accounting',
    description: 'مشاهده دفترکل و گزارش‌های مالی',
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
    ] as PermissionKey[],
  },
  {
    key: 'SUPPORT_ADMIN',
    name: 'پشتیبانی',
    description: 'مشاهده اطلاعات کاربران و تراکنش‌ها بدون دسترسی به تایید مالی',
    isSystem: true,
    permissions: [
      'users.view',
      'transactions.view',
      'legal_profile.view',
      'physical_delivery.view',
      'shop.view',
    ] as PermissionKey[],
  },
  {
    key: 'SHOP_ADMIN',
    name: 'مدیر فروشگاه',
    description: 'مدیریت محصولات، دسته‌بندی‌ها و سفارشات فروشگاه',
    isSystem: true,
    permissions: ['shop.manage', 'shop.view'] as PermissionKey[],
  },
] as const;
