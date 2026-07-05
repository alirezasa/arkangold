// api/src/accounting/accounts.seed.ts

export const CHART_OF_ACCOUNTS_DEFAULTS = [
  {
    code: 'CUSTOMER_GOLD_ASSET',
    name: 'دارایی طلای مشتریان',
    type: 'ASSET',
  },
  {
    code: 'CUSTOMER_RIAL_ASSET',
    name: 'دارایی ریالی مشتریان',
    type: 'ASSET',
  },
  {
    code: 'CUSTOMER_GOLD_LIABILITY',
    name: 'بدهی طلایی به مشتریان',
    type: 'LIABILITY',
  },
  {
    code: 'CUSTOMER_RIAL_LIABILITY',
    name: 'بدهی ریالی به مشتریان',
    type: 'LIABILITY',
  },
  {
    code: 'FEE_INCOME',
    name: 'درآمد کارمزد',
    type: 'INCOME',
  },
  {
    code: 'TAX_PAYABLE',
    name: 'مالیات پرداختنی',
    type: 'LIABILITY',
  },
] as const;
