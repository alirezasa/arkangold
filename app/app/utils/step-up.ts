// app/app/utils/step-up.ts
// FTA_TSE_EXT.4.2 — دریافت «توکن تأیید ثانویه» پیش از عملیات حساس. پنجره‌ی تأیید را StepUpProvider
// (در layout داشبورد) ثبت می‌کند؛ hookها فقط requestStepUp را صدا می‌زنند و توکن را در سرآیند
// X-Step-Up-Token همان درخواست می‌فرستند. توکن یک‌بارمصرف و ۵ دقیقه‌ای است.

export type StepUpPurpose = "withdrawal" | "internal_transfer" | "bank_account_add";
export const STEP_UP_HEADER = "X-Step-Up-Token";

type Requester = (purpose: StepUpPurpose) => Promise<string | null>;
let requester: Requester | null = null;

export function registerStepUpRequester(fn: Requester | null) {
  requester = fn;
}

/** باز کردن پنجره‌ی تأیید؛ null یعنی کاربر انصراف داد */
export async function requestStepUp(purpose: StepUpPurpose): Promise<string | null> {
  if (!requester) throw new Error("StepUpProvider mounted نشده است");
  return requester(purpose);
}

export const STEP_UP_CANCELLED_MESSAGE = "عملیات بدون تأیید هویت انجام نشد";

export class StepUpCancelledError extends Error {
  constructor() {
    super("تأیید انجام نشد");
  }
}

/** سرآیند درخواست حساس؛ اگر کاربر انصراف دهد خطای StepUpCancelledError */
export async function stepUpHeaders(purpose: StepUpPurpose) {
  const token = await requestStepUp(purpose);
  if (!token) throw new StepUpCancelledError();
  return { [STEP_UP_HEADER]: token };
}
