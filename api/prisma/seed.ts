import {
  PrismaClient,
  UserRole,
  AccountGroup,
  OwnerType,
  WalletCurrency,
} from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Arkangold database...');

  ////////////////////////////////////////////////////
  // 1️⃣ SYSTEM CONFIG
  ////////////////////////////////////////////////////

  await prisma.systemConfig.upsert({
    where: { key: 'withdraw_delay_hours' },
    update: {},
    create: {
      key: 'withdraw_delay_hours',
      value: '24',
      description: 'Delay after deposit before withdrawal allowed (hours)',
    },
  });
  ////////////////////////////////////////////////////
  // 2️⃣ TEST USER
  ////////////////////////////////////////////////////

  const user = await prisma.user.upsert({
    where: { mobile: '09212093704' },
    update: {
      role: UserRole.USER,
    },
    create: {
      mobile: '09212093704',
      role: UserRole.USER,
      isMobileVerified: true,
    },
  });

  await prisma.wallet.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
    },
  });

  ////////////////////////////////////////////////////
  // 3️⃣ SYSTEM CHART OF ACCOUNTS
  ////////////////////////////////////////////////////

  const systemAccounts = [
    {
      code: 'SYS_TREASURY_TOMAN',
      name: 'System Treasury Toman',
      group: AccountGroup.ASSET,
      currency: WalletCurrency.TOMAN,
    },
    {
      code: 'SYS_TREASURY_GOLD',
      name: 'System Treasury Gold',
      group: AccountGroup.ASSET,
      currency: WalletCurrency.GOLD,
    },
    {
      code: 'SYS_USER_TOMAN_LIABILITY',
      name: 'Users Toman Liability',
      group: AccountGroup.LIABILITY,
      currency: WalletCurrency.TOMAN,
    },
    {
      code: 'SYS_USER_GOLD_LIABILITY',
      name: 'Users Gold Liability',
      group: AccountGroup.LIABILITY,
      currency: WalletCurrency.GOLD,
    },
    {
      code: 'SYS_FEE_REVENUE',
      name: 'Fee Revenue',
      group: AccountGroup.REVENUE,
      currency: WalletCurrency.TOMAN,
    },
    {
      code: 'SYS_TAX_PAYABLE',
      name: 'Tax Payable',
      group: AccountGroup.LIABILITY,
      currency: WalletCurrency.TOMAN,
    },
  ];

  for (const acc of systemAccounts) {
    await prisma.account.upsert({
      where: { code: acc.code },
      update: {},
      create: {
        code: acc.code,
        name: acc.name,
        accountGroup: acc.group,
        ownerType: OwnerType.SYSTEM,
        currency: acc.currency,
      },
    });
  }

  ////////////////////////////////////////////////////
  // 4️⃣ MARKET PRICE
  ////////////////////////////////////////////////////

  await prisma.marketPrice.upsert({
    where: { asset: 'GOLD' },
    update: {},
    create: {
      asset: 'GOLD',
      price: 2500000,
      updatedAt: new Date(),
    },
  });

  await prisma.marketPrice.upsert({
    where: { asset: 'TOMAN' },
    update: {},
    create: {
      asset: 'TOMAN',
      price: 1,
      updatedAt: new Date(),
    },
  });

  ////////////////////////////////////////////////////
  // 5️⃣ FEE CONFIG
  ////////////////////////////////////////////////////

  await prisma.feeConfig.create({
    data: {
      operationType: 'BUY_GOLD',
      percent: 0.5,
      fixedAmount: 0,
    },
  });

  ////////////////////////////////////////////////////
  // 6️⃣ TAX CONFIG
  ////////////////////////////////////////////////////

  await prisma.taxConfig.create({
    data: {
      name: 'VAT',
      percent: 9,
      isActive: true,
    },
  });

  ////////////////////////////////////////////////////
  // 7️⃣ VAULT INVENTORY
  ////////////////////////////////////////////////////

  await prisma.vaultGoldInventory.upsert({
    where: { id: 'MAIN_VAULT' },
    update: {},
    create: {
      id: 'MAIN_VAULT',
      totalGold: 100000,
      reservedGold: 0,
    },
  });

  console.log('✅ Arkangold seed completed successfully');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
