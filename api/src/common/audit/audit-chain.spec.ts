// api/src/common/audit/audit-chain.spec.ts
//
// آزمون زنجیره‌ی hash رویدادهای امنیتی (FAU_STG_EXT.1.2) با Prisma درون‌حافظه‌ای که رفتار jsonb
// (حذف کلیدهای undefined) را شبیه‌سازی می‌کند: رکورد سالم نباید «دستکاری‌شده» تشخیص داده شود
// و دستکاری/حذف/جعل رکورد باید کشف شود.
import { AuditService } from './audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { GENESIS_HASH } from './hash-chain.util';

type Row = Record<string, unknown> & { id: string; createdAt: Date };

function createPrismaMock() {
  const rows: Row[] = [];
  const state = { lastHash: GENESIS_HASH };
  let seq = 0;
  const tx = {
    $queryRaw: () => Promise.resolve([{ last_hash: state.lastHash }]),
    adminAuditLog: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        // ستون خالی مثل Prisma null برمی‌گردد؛ محتوای jsonb مثل PostgreSQL رفت‌وبرگشت JSON می‌شود
        // (کلیدهای undefined داخل آن حذف می‌شوند)
        for (const key of Object.keys(data)) data[key] ??= null;
        const stored = JSON.parse(JSON.stringify(data)) as Record<
          string,
          unknown
        >;
        rows.push({
          ...stored,
          id: `row-${String(++seq).padStart(3, '0')}`,
          createdAt: data.createdAt as Date,
        });
        return Promise.resolve();
      },
    },
    auditChainState: {
      upsert: ({ update }: { update: { lastHash: string } }) => {
        state.lastHash = update.lastHash;
        return Promise.resolve();
      },
    },
  };
  const prisma = {
    $transaction: (fn: (t: typeof tx) => Promise<void>) => fn(tx),
    auditChainState: {
      findUnique: () => Promise.resolve({ lastHash: state.lastHash }),
    },
    adminAuditLog: {
      findMany: () =>
        Promise.resolve(
          [...rows].sort(
            (a, b) =>
              a.createdAt.getTime() - b.createdAt.getTime() ||
              a.id.localeCompare(b.id),
          ),
        ),
    },
  };
  return { prisma: prisma as unknown as PrismaService, rows };
}

async function seed(count: number) {
  const { prisma, rows } = createPrismaMock();
  const audit = new AuditService(prisma);
  for (let i = 0; i < count; i++) {
    await audit.logAdmin({
      action: 'test.event',
      source: 'spec',
      newValue: { i },
    });
  }
  return { audit, rows };
}

describe('AuditService hash chain', () => {
  it('payload با فیلد undefined پس از ذخیره معتبر می‌ماند', async () => {
    const { audit } = await seed(1);
    await audit.logAdmin({
      action: 'test.event',
      source: 'spec',
      newValue: { reason: undefined, nested: { note: undefined, a: 1 } },
    });
    expect(await audit.verifyChain('admin')).toEqual({
      valid: true,
      checked: 2,
    });
  });

  it('ترتیب createdAt متفاوت با ترتیب زنجیره (نوشتن همزمان) دستکاری حساب نمی‌شود', async () => {
    const { audit, rows } = await seed(5);
    // رکورد سوم زودتر از دوم مهر زمانی گرفته (createdAt پیش از قفل) و یکی هم‌میلی‌ثانیه
    [rows[1].createdAt, rows[2].createdAt] = [
      rows[2].createdAt,
      rows[1].createdAt,
    ];
    rows[4].createdAt = rows[3].createdAt;
    expect(await audit.verifyChain('admin')).toEqual({
      valid: true,
      checked: 5,
    });
  });

  it('تغییر محتوای رکورد کشف می‌شود', async () => {
    const { audit, rows } = await seed(5);
    rows[2].action = 'test.tampered';
    expect(await audit.verifyChain('admin')).toEqual({
      valid: false,
      checked: 2,
      brokenAtId: rows[2].id,
    });
  });

  it('حذف رکورد میانی کشف می‌شود', async () => {
    const { audit, rows } = await seed(5);
    rows.splice(2, 1);
    expect(await audit.verifyChain('admin')).toEqual({
      valid: false,
      checked: 2,
      brokenAtId: rows[2].id,
    });
  });

  it('حذف رکورد انتهایی کشف می‌شود', async () => {
    const { audit, rows } = await seed(5);
    rows.pop();
    expect(await audit.verifyChain('admin')).toEqual({
      valid: false,
      checked: 4,
      brokenAtId: rows[3].id,
    });
  });

  it('رکورد جعلی با prevHash تکراری کشف می‌شود', async () => {
    const { audit, rows } = await seed(5);
    rows.push({ ...rows[2], id: 'row-forged', action: 'test.forged' });
    const result = await audit.verifyChain('admin');
    expect(result.valid).toBe(false);
  });
});
