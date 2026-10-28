// api/src/livechat/livechat-bot.service.ts
//
// منوی ربات (پاسخ‌های آماده‌ی درختی): ساخت دکمه‌های هر مرحله و محتوای پیش‌فرض اولیه.
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LivechatBotAction, LivechatBotNode } from '../generated/prisma';
import type { LivechatSettingsData } from './livechat-settings.types';
import type { BotOption } from './livechat.mappers';

type Audience = 'USER' | 'GUEST';

@Injectable()
export class LivechatBotService {
  private readonly logger = new Logger(LivechatBotService.name);

  constructor(private readonly prisma: PrismaService) {}

  private visible(
    node: Pick<LivechatBotNode, 'audience' | 'isActive'>,
    audience: Audience,
  ) {
    return (
      node.isActive && (node.audience === 'ALL' || node.audience === audience)
    );
  }

  async findNode(id: string | null | undefined) {
    if (!id) return null;
    return this.prisma.livechatBotNode.findFirst({
      where: { id, isActive: true },
    });
  }

  async children(parentId: string | null, audience: Audience) {
    const nodes = await this.prisma.livechatBotNode.findMany({
      where: { parentId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return nodes.filter((n) => this.visible(n, audience));
  }

  nodeOption(n: LivechatBotNode): BotOption {
    if (n.action === LivechatBotAction.LINK && n.url && !n.replyText) {
      return {
        id: `link:${n.id}`,
        label: n.label,
        kind: 'link',
        url: n.url,
        nodeId: n.id,
        icon: n.icon,
      };
    }
    return {
      id: `node:${n.id}`,
      label: n.label,
      kind: 'node',
      nodeId: n.id,
      icon: n.icon,
    };
  }

  /** دکمه‌های ثابت انتهای هر مرحله: بازگشت، منوی اصلی، گفتگو با کارشناس */
  footer(
    bot: LivechatSettingsData['bot'],
    opts: { parentId?: string | null; atRoot: boolean; showOperator: boolean },
  ): BotOption[] {
    const out: BotOption[] = [];
    if (!opts.atRoot && opts.parentId) {
      out.push({
        id: `back:${opts.parentId}`,
        label: bot.backLabel,
        kind: 'back',
        nodeId: opts.parentId,
      });
    }
    if (!opts.atRoot && bot.showMainMenuButton) {
      out.push({ id: 'main', label: bot.mainMenuLabel, kind: 'main' });
    }
    if (opts.showOperator && bot.showOperatorButton) {
      out.push({
        id: 'operator',
        label: bot.operatorButtonLabel,
        kind: 'operator',
      });
    }
    return out;
  }

  async rootOptions(audience: Audience): Promise<BotOption[]> {
    return (await this.children(null, audience)).map((n) => this.nodeOption(n));
  }

  /** گزینه‌های پس از انتخاب یک گره: فرزندان آن (یا خود پیوند) + دکمه‌های ثابت */
  async optionsAfter(
    node: LivechatBotNode,
    audience: Audience,
    bot: LivechatSettingsData['bot'],
    showOperator: boolean,
  ): Promise<BotOption[]> {
    const kids = (await this.children(node.id, audience)).map((n) =>
      this.nodeOption(n),
    );
    if (node.action === LivechatBotAction.LINK && node.url) {
      kids.unshift({
        id: `link:${node.id}`,
        label: node.label,
        kind: 'link',
        url: node.url,
        nodeId: node.id,
      });
    }
    return [
      ...kids,
      ...this.footer(bot, {
        parentId: kids.length ? node.parentId : node.parentId,
        atRoot: false,
        showOperator,
      }),
    ];
  }

  /** محتوای اولیه‌ی منو (فقط بار اول راه‌اندازی، وقتی هنوز تنظیماتی ذخیره نشده) */
  async seedDefaults() {
    const existing = await this.prisma.livechatBotNode.count();
    if (existing > 0) return;
    const general =
      (await this.prisma.livechatDepartment.findFirst({
        where: { name: 'پشتیبانی عمومی' },
      })) ??
      (await this.prisma.livechatDepartment.create({
        data: {
          name: 'پشتیبانی عمومی',
          description: 'پرسش‌های عمومی، حساب کاربری و سفارش‌ها',
          sortOrder: 0,
        },
      }));
    const finance =
      (await this.prisma.livechatDepartment.findFirst({
        where: { name: 'واحد مالی' },
      })) ??
      (await this.prisma.livechatDepartment.create({
        data: {
          name: 'واحد مالی',
          description: 'واریز، برداشت، تسویه و فاکتورها',
          sortOrder: 1,
        },
      }));

    let order = 0;
    const node = (
      data: Partial<LivechatBotNode> & {
        label: string;
        action: LivechatBotAction;
      },
      parentId: string | null = null,
    ) =>
      this.prisma.livechatBotNode.create({
        data: {
          label: data.label,
          action: data.action,
          replyText: data.replyText ?? null,
          url: data.url ?? null,
          departmentId: data.departmentId ?? null,
          keywords: data.keywords ?? [],
          icon: data.icon ?? null,
          parentId,
          sortOrder: order++,
        },
      });

    await node({
      label: 'چگونه در آرکان گلد ثبت نام کنیم؟',
      action: LivechatBotAction.ANSWER,
      icon: '📝',
      keywords: ['ثبت نام', 'عضویت', 'ساخت حساب', 'افتتاح حساب', 'احراز هویت'],
      replyText:
        'ثبت‌نام در آرکان گلد چند دقیقه بیشتر طول نمی‌کشد:\n' +
        '۱. در اپ آرکان گلد گزینه‌ی «ثبت‌نام» را بزنید و شماره موبایل به نام خودتان را وارد کنید.\n' +
        '۲. کد تأیید پیامک‌شده را وارد و رمز عبور تعیین کنید.\n' +
        '۳. احراز هویت (کد ملی و تاریخ تولد) را تکمیل کنید.\n' +
        '۴. کارت بانکی به نام خودتان را ثبت کنید تا خرید، فروش و برداشت فعال شود.',
    });
    await node({
      label: 'اطلاع از ساعات کاری',
      action: LivechatBotAction.ANSWER,
      icon: '🕘',
      keywords: [
        'ساعت کاری',
        'ساعات کاری',
        'تایم کاری',
        'چه ساعتی',
        'روزهای کاری',
        'تعطیل',
      ],
      replyText:
        'ساعات پاسخ‌گویی کارشناسان آرکان گلد:\n{{working_hours}}\n\nخرید و فروش آنلاین در اپ به‌صورت شبانه‌روزی فعال است.',
    });
    await node({
      label: 'گفتگو با کارشناس مالی',
      action: LivechatBotAction.HANDOFF,
      icon: '💳',
      departmentId: finance.id,
      keywords: [
        'کارشناس مالی',
        'واحد مالی',
        'واریز',
        'برداشت',
        'تسویه',
        'فاکتور',
      ],
      replyText: 'در حال اتصال شما به کارشناس مالی…',
    });
    const delivery = await node({
      label: 'تحویل فیزیکی شمش طلا',
      action: LivechatBotAction.ANSWER,
      icon: '📦',
      keywords: ['تحویل فیزیکی', 'دریافت شمش', 'تحویل حضوری', 'تبدیل به شمش'],
      replyText:
        'برای دریافت فیزیکی طلای خود، از داشبورد به «کیف پول ← تحویل فیزیکی» بروید، وزن و نوع شمش را انتخاب و درخواست را ثبت کنید. پس از تأیید، زمان و نحوه‌ی تحویل به شما اعلام می‌شود.',
    });
    await node(
      {
        label: 'ثبت درخواست تحویل فیزیکی',
        action: LivechatBotAction.LINK,
        url: '/dashboard/wallet/physical-delivery',
      },
      delivery.id,
    );
    await node({
      label: 'نحوه ارسال شمش های طلا',
      action: LivechatBotAction.ANSWER,
      icon: '🚚',
      keywords: [
        'ارسال شمش',
        'پست',
        'پیک',
        'کد رهگیری',
        'هزینه ارسال',
        'بیمه ارسال',
      ],
      replyText:
        'شمش‌ها در بسته‌بندی ایمن و پلمب‌شده و با بیمه ارسال می‌شوند. روش ارسال (پیک یا پست) و هزینه‌ی آن هنگام ثبت سفارش بر اساس شهر شما نمایش داده می‌شود و پس از ارسال، کد رهگیری در بخش سفارش‌ها قابل مشاهده است.',
    });
    await node({
      label: 'نحوه فروش شمش طلا به آرکان گلد',
      action: LivechatBotAction.ANSWER,
      icon: '💰',
      keywords: ['فروش شمش', 'بازخرید', 'فروش طلا', 'پس دادن شمش'],
      replyText:
        'برای فروش شمش به آرکان گلد، از داشبورد گزینه‌ی «فروش شمش» را انتخاب و درخواست بازخرید ثبت کنید. پس از دریافت و اصالت‌سنجی شمش، مبلغ نهایی اعلام و به حساب بانکی پیش‌فرض شما واریز می‌شود.',
    });
    const verify = await node({
      label: 'اصالت سنجی شمش طلا',
      action: LivechatBotAction.ANSWER,
      icon: '🔍',
      keywords: ['اصالت', 'اصالت سنجی', 'هولوگرام', 'استعلام شمش', 'تقلبی'],
      replyText:
        'هر شمش آرکان گلد دارای هولوگرام و کد یکتاست. با وارد کردن کد هولوگرام در صفحه‌ی استعلام، مشخصات و وضعیت اصالت شمش نمایش داده می‌شود.',
    });
    await node(
      {
        label: 'ورود به صفحه‌ی استعلام اصالت',
        action: LivechatBotAction.LINK,
        url: '/verify',
      },
      verify.id,
    );
    await node({
      label: 'سایر موارد',
      action: LivechatBotAction.HANDOFF,
      icon: '💬',
      departmentId: general.id,
      replyText: 'سوال خود را بنویسید؛ کارشناسان ما در اسرع وقت پاسخ می‌دهند.',
    });

    const kbCount = await this.prisma.livechatKnowledgeItem.count();
    if (kbCount === 0) {
      await this.prisma.livechatKnowledgeItem.createMany({
        data: [
          {
            question: 'قیمت لحظه‌ای طلا چقدر است؟',
            variants: [
              'قیمت طلا',
              'نرخ طلا امروز',
              'هر گرم طلا چند است',
              'قیمت هر گرم',
            ],
            keywords: ['قیمت طلا', 'نرخ طلا'],
            answer:
              'قیمت هر گرم طلا در آرکان گلد هم‌اکنون {{gold_price}} تومان است. قیمت به‌صورت لحظه‌ای در صفحه‌ی خرید و فروش اپ به‌روز می‌شود.',
          },
          {
            question: 'رمز عبورم را فراموش کرده‌ام',
            variants: [
              'بازیابی رمز عبور',
              'رمزم یادم رفته',
              'نمی‌توانم وارد شوم',
            ],
            keywords: ['فراموشی رمز', 'بازیابی رمز', 'رمز عبور'],
            answer:
              'در صفحه‌ی ورود گزینه‌ی «فراموشی رمز عبور» را بزنید؛ با کد تأیید پیامکی، رمز جدید تعیین کنید.',
          },
          {
            question: 'چرا کد تأیید پیامک نمی‌شود؟',
            variants: [
              'کد تایید نمیاد',
              'پیامک دریافت نمی‌کنم',
              'کد ورود نیامد',
            ],
            keywords: ['کد تایید', 'پیامک نمیاد'],
            answer:
              'لطفاً چند دقیقه صبر کنید و از درست بودن شماره مطمئن شوید. اگر پیامک‌های تبلیغاتی روی خط شما مسدود است، آن را از طریق اپراتور فعال کنید و دوباره درخواست کد بدهید.',
          },
        ],
      });
    }
    this.logger.log('[Livechat] منوی ربات و پایگاه دانش پیش‌فرض ایجاد شد');
  }
}
