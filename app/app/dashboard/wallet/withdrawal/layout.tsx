"use client";

import type { ReactNode } from "react";
import BankAccountGate from "../../components/BankAccountGate";

// برداشت وجه فقط به حساب بانکی تأییدشده به نام خود کاربر
export default function WithdrawalLayout({ children }: { children: ReactNode }) {
  return <BankAccountGate>{children}</BankAccountGate>;
}
