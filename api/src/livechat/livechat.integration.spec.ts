// api/src/livechat/livechat.integration.spec.ts
//
// آزمون یکپارچه‌ی چت آنلاین روی PostgreSQL واقعی (پس از prisma migrate deploy):
//   نشست بازدیدکننده ← منوی ربات ← حالت هوشمند (پایگاه دانش + قیمت لحظه‌ای) ← درخواست کارشناس ←
//   فرم پیش از گفتگو ← تخصیص خودکار ← پاسخ و پیامک بازدیدکننده‌ی آفلاین ← بستن و امتیاز ←
//   حالت آفلاین و پیامک مدیران ← جداسازی گفتگوی کاربر واردشده از توکن مهمان
//
// اجرا:  INTEGRATION_DATABASE_URL=postgresql://... npx jest livechat.integration
// بدون این متغیر آزمون رد (skip) می‌شود.
import { randomUUID } from 'crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PriceService } from '../market/price.service';
import type { FileSecurityService } from '../common/file-security/file-security.service';
import { LivechatService, OperatorActor } from './livechat.service';
import { LivechatSettingsService } from './livechat-settings.service';
import { LivechatRealtimeService } from './livechat-realtime.service';
import { LivechatBotService } from './livechat-bot.service';
import { LivechatSmartService } from './livechat-smart.service';
import type { LivechatStorageService } from './livechat-storage.service';

const url = process.env.INTEGRATION_DATABASE_URL;
const run = url ? describe : describe.skip;

run('چت آنلاین (یکپارچه با PostgreSQL)', () => {
  let prisma: PrismaService;
  let settings: LivechatSettingsService;
  let realtime: LivechatRealtimeService;
  let livechat: LivechatService;
  let actor: OperatorActor;
  const sms: { to: string; text: string }[] = [];
  const suffix = randomUUID().slice(0, 8);
  // وضعیت قبلی پایگاه داده که آزمون تغییر می‌دهد و در پایان برمی‌گرداند
  let previousSettings: unknown = undefined;
  let pausedOperators: string[] = [];

  const lastMessages = async (visitorId: string, take = 5) =>
    (await livechat.visitorHistory(visitorId)).items.slice(-take);

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url }),
    }) as unknown as PrismaService;
    const config = new SystemConfigService(prisma);
    await config.onModuleInit();
    settings = new LivechatSettingsService(prisma, config);
    realtime = new LivechatRealtimeService();
    const notifications = {
      notifyPhoneSms: (to: string, text: string) => {
        sms.push({ to, text });
        return Promise.resolve();
      },
      notifyUserSms: (to: string, text: string) => {
        sms.push({ to: `user:${to}`, text });
        return Promise.resolve();
      },
    } as unknown as NotificationsService;
    const price = {
      getCurrentGoldPriceDecimal: () =>
        Promise.resolve({ toFixed: () => '85000000' }),
    } as unknown as PriceService;
    const bot = new LivechatBotService(prisma);
    livechat = new LivechatService(
      prisma,
      settings,
      realtime,
      bot,
      new LivechatSmartService(prisma),
      {} as LivechatStorageService,
      notifications,
      price,
      {} as FileSecurityService,
    );
    await livechat.onModuleInit();
    previousSettings = (
      await prisma.livechatSettings.findUnique({ where: { id: 1 } })
    )?.data;
    // ساعات کاری در آزمون اعمال نمی‌شود تا نتیجه به ساعت اجرا بستگی نداشته باشد
    await settings.update(
      {
        workingHours: { enabled: false },
        routing: { mode: 'auto' },
        preChat: {
          enabled: true,
          onlyGuests: true,
          askName: true,
          askPhone: true,
        },
        notifications: {
          smsAdminsOnOffline: true,
          adminPhones: ['09120000000'],
          smsCooldownMinutes: 0,
        },
      },
      randomUUID(),
    );

    const admin = await prisma.adminUser.create({
      data: {
        username: `lc-op-${suffix}`,
        passwordHash: 'x',
        fullName: 'کارشناس آزمون',
      },
    });
    const op = await prisma.livechatOperator.create({
      data: {
        adminUserId: admin.id,
        displayName: `سارا ${suffix}`,
        status: 'ONLINE',
      },
    });
    actor = {
      operatorId: op.id,
      adminUserId: admin.id,
      displayName: op.displayName,
      canViewAll: false,
    };
    // سایر اپراتورها در تخصیص این آزمون شرکت نکنند (در پایان برگردانده می‌شود)
    pausedOperators = (
      await prisma.livechatOperator.findMany({
        where: { id: { not: op.id }, acceptsAutoAssign: true },
        select: { id: true },
      })
    ).map((o) => o.id);
    await prisma.livechatOperator.updateMany({
      where: { id: { in: pausedOperators } },
      data: { acceptsAutoAssign: false },
    });
  });

  afterAll(async () => {
    await prisma.livechatOperator.updateMany({
      where: { id: { in: pausedOperators } },
      data: { acceptsAutoAssign: true },
    });
    if (previousSettings !== undefined) {
      await prisma.livechatSettings.update({
        where: { id: 1 },
        data: { data: previousSettings as object },
      });
    }
    await prisma.$disconnect();
  });

  it('سناریوی کامل گفتگو با ربات و کارشناس', async () => {
    const session = await livechat.createSession({
      url: 'https://app.arkan.gold/dashboard',
    });
    const visitorId = session.visitor.id;
    expect(session.menu.greeting).toBe('در چه موردی سوال دارید؟');
    const labels = session.menu.options.map((o) => o.label);
    for (const l of [
      'اطلاع از ساعات کاری',
      'گفتگو با کارشناس مالی',
      'اصالت سنجی شمش طلا',
      'سایر موارد',
    ]) {
      expect(labels).toContain(l);
    }

    // منوی ربات
    const hours = session.menu.options.find(
      (o) => o.label === 'اطلاع از ساعات کاری',
    );
    expect(hours).toBeDefined();
    await livechat.visitorSelectOption(visitorId, {
      kind: 'node',
      nodeId: hours?.nodeId,
      clientMessageId: 'a1',
    });
    let msgs = await lastMessages(visitorId, 2);
    expect(msgs[0].body).toBe('اطلاع از ساعات کاری');
    // ساعات کاری در این آزمون خاموش است ← متن «شبانه‌روزی» جایگزین متغیر می‌شود
    expect(msgs[1].body).toContain('شبانه‌روزی');
    expect(msgs[1].body).not.toContain('{{');
    const options =
      (msgs[1].payload as { options?: { kind: string }[] } | null)?.options ??
      [];
    expect(options.some((o) => o.kind === 'operator')).toBe(true);

    // حالت هوشمند با متغیر قیمت
    await livechat.visitorSendText(visitorId, {
      text: 'قیمت طلا امروز چنده؟',
      clientMessageId: 'a2',
    });
    msgs = await lastMessages(visitorId, 1);
    expect(msgs[0].body).toContain('۸٬۵۰۰٬۰۰۰');

    // پیام تکراری با همان clientMessageId ثبت نمی‌شود
    const before = (await livechat.visitorHistory(visitorId)).items.length;
    await livechat.visitorSendText(visitorId, {
      text: 'قیمت طلا امروز چنده؟',
      clientMessageId: 'a2',
    });
    expect((await livechat.visitorHistory(visitorId)).items.length).toBe(
      before,
    );

    // درخواست کارشناس ← فرم پیش از گفتگو
    realtime.operatorConnected(
      actor.operatorId,
      actor.adminUserId,
      'sock-op',
      'ONLINE',
    );
    await livechat.visitorSendText(visitorId, {
      text: 'لطفا وصلم کنید به کارشناس',
      clientMessageId: 'a3',
    });
    msgs = await lastMessages(visitorId, 1);
    expect(msgs[0].type).toBe('FORM');
    await expect(
      livechat.visitorSubmitForm(visitorId, {
        messageId: msgs[0].id,
        values: { name: 'علی', phone: '123' },
      }),
    ).rejects.toThrow('شماره موبایل معتبر نیست');
    await livechat.visitorSubmitForm(visitorId, {
      messageId: msgs[0].id,
      values: { name: 'علی آزمون', phone: '۰۹۱۲ ۳۴۵ ۶۷۸۹' },
    });

    const conv = await prisma.livechatConversation.findFirstOrThrow({
      where: { visitorId },
      orderBy: { createdAt: 'desc' },
    });
    expect(conv.status).toBe('OPEN');
    expect(conv.operatorId).toBe(actor.operatorId);
    const visitor = await prisma.livechatVisitor.findUniqueOrThrow({
      where: { id: visitorId },
    });
    expect(visitor.phone).toBe('09123456789');

    // پاسخ کارشناس؛ بازدیدکننده آنلاین نیست ← پیامک
    await livechat.operatorSend(actor, conv.id, { text: 'سلام، در خدمتم' });
    await livechat.operatorSend(actor, conv.id, {
      text: 'یادداشت',
      isInternal: true,
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(
      sms.some((s) => s.to === '09123456789' && s.text.includes('پاسخ')),
    ).toBe(true);
    const history = await livechat.visitorHistory(visitorId);
    expect(history.items.some((m) => m.body === 'یادداشت')).toBe(false);

    // بستن و امتیاز
    await livechat.operatorClose(actor, conv.id);
    msgs = await lastMessages(visitorId, 1);
    expect(msgs[0].type).toBe('RATING');
    await livechat.visitorRate(visitorId, {
      messageId: msgs[0].id,
      rating: 5,
      comment: 'عالی',
    });
    const closed = await prisma.livechatConversation.findUniqueOrThrow({
      where: { id: conv.id },
    });
    expect(closed).toMatchObject({
      status: 'CLOSED',
      rating: 5,
      ratingComment: 'عالی',
      closedBy: 'OPERATOR',
    });

    // حالت آفلاین: کارشناسی متصل نیست
    realtime.operatorDisconnected(actor.operatorId, 'sock-op');
    sms.length = 0;
    await livechat.visitorSelectOption(visitorId, {
      kind: 'operator',
      clientMessageId: 'a4',
    });
    const offline = await prisma.livechatConversation.findFirstOrThrow({
      where: { visitorId, status: { not: 'CLOSED' } },
    });
    expect(offline).toMatchObject({
      status: 'WAITING',
      isOffline: true,
      operatorId: null,
    });
    expect(sms.some((s) => s.to === '09120000000')).toBe(true);

    // پاسخ کارشناس به پیام آفلاین، گفتگو را به او می‌سپارد
    await livechat.operatorSend(actor, offline.id, {
      text: 'پاسخ پیام آفلاین شما',
    });
    const claimed = await prisma.livechatConversation.findUniqueOrThrow({
      where: { id: offline.id },
    });
    expect(claimed).toMatchObject({
      status: 'OPEN',
      operatorId: actor.operatorId,
    });
  });

  it('گفتگوی کاربر واردشده با توکن مهمان (پس از خروج) نمایش داده نمی‌شود', async () => {
    const user = await prisma.user.create({
      data: {
        phone: `0919${String(Date.now()).slice(-7)}`,
        referralCode: `LC${suffix}`,
      },
    });
    const guest = await livechat.createSession({});
    // ورود: توکن مهمان به حساب کاربر متصل می‌شود
    const asUser = await livechat.createSession({
      token: guest.token,
      userId: user.id,
    });
    expect(asUser.visitor.id).toBe(guest.visitor.id);
    expect(asUser.visitor.isUser).toBe(true);
    expect(asUser.visitor.phone).toBe(user.phone);
    // خروج: همان مرورگر با همان توکن ولی بدون کاربر ← بازدیدکننده‌ی جدید
    const afterLogout = await livechat.createSession({ token: asUser.token });
    expect(afterLogout.visitor.id).not.toBe(guest.visitor.id);
    expect(afterLogout.messages).toHaveLength(0);
    // ورود دوباره از دستگاه دیگر ← همان بازدیدکننده‌ی کاربر
    const otherDevice = await livechat.createSession({ userId: user.id });
    expect(otherDevice.visitor.id).toBe(guest.visitor.id);
  });
});
