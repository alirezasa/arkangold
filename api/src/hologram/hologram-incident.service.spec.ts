// api/src/hologram/hologram-incident.service.spec.ts
//
// گزارش سرقت/مفقودی روی یک Prisma درون‌حافظه‌ای: فقط مالک گزارش می‌دهد، انتقال در جریان
// لغو می‌شود، دو گزارش فعال همزمان مجاز نیست و ماشین وضعیت رعایت می‌شود.
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { HologramIncidentService } from './hologram-incident.service';
import { assertNoActiveIncident } from './hologram-incident.util';
import type { PrismaService } from '../prisma/prisma.service';
import type { DocumentSequenceService } from '../common/documents/document-sequence.service';
import type { SmsTemplateService } from '../notifications/sms-template.service';
import type { HologramTransferService } from './hologram-transfer.service';
import {
  HologramIncidentType,
  type CreateHologramIncidentDto,
} from '@arkan-gold/shared';

interface Report {
  id: string;
  reportNumber: string;
  hologramCodeId: string;
  type: 'THEFT' | 'LOSS';
  status: 'OPEN' | 'CONFIRMED' | 'RECOVERED' | 'REJECTED' | 'CANCELLED';
  reportedByUserId: string | null;
  createdAt: Date;
  [k: string]: unknown;
}

const OWNER = 'user-owner';
const CODE_ID = 'code-1';

function setup(codeStatus: 'ASSIGNED' | 'TRANSFER_PENDING' = 'ASSIGNED') {
  const code = {
    id: CODE_ID,
    code: '12345678',
    status: codeStatus,
    ownerships: [
      {
        ownerUserId: OWNER,
        fullName: 'علی رضایی',
        nationalCode: '0012345678',
      },
    ],
  };
  const reports: Report[] = [];
  let seq = 0;

  const db = {
    $executeRaw: () => Promise.resolve(1),
    hologramCode: {
      findUnique: () => Promise.resolve(code),
      update: ({ data }: { data: { status: typeof code.status } }) => {
        code.status = data.status;
        return Promise.resolve(code);
      },
    },
    hologramIncidentReport: {
      findFirst: ({
        where,
      }: {
        where: { hologramCodeId: string; status: { in: string[] } };
      }) =>
        Promise.resolve(
          reports.find(
            (r) =>
              r.hologramCodeId === where.hologramCodeId &&
              where.status.in.includes(r.status),
          ) ?? null,
        ),
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(reports.find((r) => r.id === where.id) ?? null),
      create: ({ data }: { data: Omit<Report, 'id' | 'createdAt'> }) => {
        const row = {
          ...data,
          id: `r-${reports.length + 1}`,
          createdAt: new Date(),
        } as Report;
        reports.push(row);
        return Promise.resolve({ ...row, hologramCode: { code: code.code } });
      },
      update: ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<Report>;
      }) => {
        const row = reports.find((r) => r.id === where.id);
        Object.assign(row, data);
        return Promise.resolve({ ...row, hologramCode: { code: code.code } });
      },
    },
  };
  const prisma = {
    ...db,
    $transaction: (fn: (tx: typeof db) => Promise<unknown>) => fn(db),
  } as unknown as PrismaService;

  const cancelPendingForCode = jest.fn(() => Promise.resolve());
  const service = new HologramIncidentService(
    prisma,
    {
      next: () => Promise.resolve(`AG-1405-HIR-${++seq}`),
    } as unknown as DocumentSequenceService,
    { cancelPendingForCode } as unknown as HologramTransferService,
    {
      sendToUser: () => Promise.resolve({ status: 'SENT' }),
    } as unknown as SmsTemplateService,
  );
  return { service, prisma, code, reports, cancelPendingForCode };
}

const dto = (
  over: Partial<CreateHologramIncidentDto> = {},
): CreateHologramIncidentDto => ({
  hologramCodeId: CODE_ID,
  type: HologramIncidentType.THEFT,
  description: 'شمش از منزل سرقت شد',
  ...over,
});

describe('HologramIncidentService', () => {
  it('ثبت گزارش توسط مالک: OPEN با snapshot مالک', async () => {
    const { service, reports } = setup();
    const r = await service.createByOwner(OWNER, dto());
    expect(r.status).toBe('OPEN');
    expect(reports[0]).toMatchObject({
      reportedByUserId: OWNER,
      ownerFullName: 'علی رضایی',
      ownerNationalCode: '0012345678',
    });
  });

  it('غیرمالک نمی‌تواند گزارش ثبت کند', async () => {
    const { service } = setup();
    await expect(
      service.createByOwner('someone-else', dto()),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('انتقال در جریان لغو و شمش به ASSIGNED برمی‌گردد', async () => {
    const { service, code, cancelPendingForCode } = setup('TRANSFER_PENDING');
    await service.createByOwner(OWNER, dto());
    expect(cancelPendingForCode).toHaveBeenCalledTimes(1);
    expect(code.status).toBe('ASSIGNED');
  });

  it('گزارش فعال دوم برای همان شمش رد می‌شود', async () => {
    const { service } = setup();
    await service.createByOwner(OWNER, dto());
    await expect(
      service.createByOwner(OWNER, dto({ type: HologramIncidentType.LOSS })),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('شمش گزارش‌شده قابل انتقال/فروش نیست تا گزارش بسته شود', async () => {
    const { service, prisma, reports } = setup();
    await service.createByOwner(OWNER, dto());
    await expect(
      assertNoActiveIncident(prisma, CODE_ID),
    ).rejects.toBeInstanceOf(ConflictException);

    await service.recover('admin-1', reports[0].id, 'به مالک تحویل شد');
    await expect(
      assertNoActiveIncident(prisma, CODE_ID),
    ).resolves.toBeUndefined();
  });

  it('ماشین وضعیت: تأیید، عدم امکان لغو توسط مالک پس از تأیید، و پایانی بودن بازیابی', async () => {
    const { service, reports } = setup();
    await service.createByOwner(OWNER, dto());
    const id = reports[0].id;

    await service.confirm('admin-1', id);
    expect(reports[0].status).toBe('CONFIRMED');

    await expect(service.cancelByOwner(OWNER, id)).rejects.toBeInstanceOf(
      ConflictException,
    );

    await service.recover('admin-1', id, 'شمش کشف شد');
    expect(reports[0].status).toBe('RECOVERED');
    expect(reports[0].closedAt).toBeInstanceOf(Date);

    await expect(
      service.reject('admin-1', id, 'گزارش نادرست'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('مالک گزارش OPEN را لغو می‌کند؛ کاربر دیگر گزارش را نمی‌بیند', async () => {
    const { service, reports } = setup();
    await service.createByOwner(OWNER, dto());
    const id = reports[0].id;

    await expect(service.cancelByOwner('intruder', id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const res = await service.cancelByOwner(OWNER, id);
    expect(res.alreadyProcessed).toBe(false);
    expect(reports[0].status).toBe('CANCELLED');
  });
});
