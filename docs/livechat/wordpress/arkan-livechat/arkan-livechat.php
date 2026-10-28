<?php
/**
 * Plugin Name: چت آنلاین آرکان گلد
 * Description: نمایش ویجت چت آنلاین پشتیبانی آرکان گلد (همان چت اپ و پنل مدیریت) روی این سایت.
 * Version: 1.0.0
 * Author: Arkan Gold
 * License: Proprietary
 *
 * نصب: پوشه‌ی arkan-livechat را zip کنید و از «افزونه‌ها ← افزودن ← بارگذاری افزونه» نصب و فعال کنید
 * (یا فقط همین فایل را در wp-content/mu-plugins بگذارید). تنظیمی ندارد؛ ظاهر و رفتار چت از
 * «پنل مدیریت آرکان گلد ← چت آنلاین ← تنظیمات» است.
 */

if (!defined('ABSPATH')) {
    exit;
}

// نشانی اپ؛ در wp-config.php می‌توان عوض کرد: define('ARKAN_LIVECHAT_ORIGIN', 'https://app.arkan.gold');
if (!defined('ARKAN_LIVECHAT_ORIGIN')) {
    define('ARKAN_LIVECHAT_ORIGIN', 'https://app.arkan.gold');
}

add_action('wp_enqueue_scripts', function () {
    // در پیش‌نمایش ویرایشگر و صفحات مدیریت وردپرس بارگذاری نمی‌شود
    if (is_admin() || is_customize_preview()) {
        return;
    }
    wp_enqueue_script(
        'arkan-livechat',
        esc_url(ARKAN_LIVECHAT_ORIGIN . '/livechat-embed.js'),
        [],
        null,
        ['in_footer' => true, 'strategy' => 'defer']
    );
});
